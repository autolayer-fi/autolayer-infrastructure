import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Request, Response } from "express";
import { Agent, Headers, fetch as undiciFetch } from "undici";
import { z } from "zod";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
} from "@x402/core/types";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { decryptValue, encryptValue } from "./crypto.js";
import { facilitator } from "./x402-facilitator.js";
import { removeGatewayResource, upsertGatewayResource } from "./bazaar.js";
import { requireOwner, type AuthRequest } from "./console-auth.js";

const stellarAddress = z.string().regex(/^[GC][A-Z2-7]{55}$/);
const contractAddress = z.string().regex(/^C[A-Z2-7]{55}$/);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/);
export const secretInput = z.object({
  name: z.string().min(2).max(80),
  value: z.string().min(1).max(16384),
});
export const wrapperInput = z
  .object({
    slug: slug.optional(),
    name: z.string().min(2).max(120),
    description: z.string().max(1000).default(""),
    upstreamUrl: z.string().url().max(2048),
    network: z.enum(["stellar:testnet", "stellar:pubnet"]),
    asset: contractAddress,
    amount: z.string().regex(/^[1-9][0-9]*$/),
    payTo: stellarAddress,
    mimeType: z.string().min(3).max(120).default("application/json"),
    tags: z.array(z.string().min(1).max(40)).max(20).default([]),
    secretId: z.string().uuid().nullable().default(null),
    authType: z.enum(["none", "header", "bearer"]).default("none"),
    authHeader: z.string().min(1).max(100).nullable().default(null),
    requestsPerMinute: z.number().int().min(1).max(10000).default(60),
    monthlyRequestQuota: z.number().int().min(1).max(100000000).default(100000),
    maxRequestBytes: z.number().int().min(0).max(10485760).default(1048576),
    maxResponseBytes: z.number().int().min(1024).max(52428800).default(5242880),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.authType !== "none" && !value.secretId)
      ctx.addIssue({
        code: "custom",
        path: ["secretId"],
        message: "secretId is required for upstream authorization",
      });
    if (value.authType === "header" && !value.authHeader)
      ctx.addIssue({
        code: "custom",
        path: ["authHeader"],
        message: "authHeader is required for header authorization",
      });
  });
export const wrapperPatch = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).optional(),
  upstreamUrl: z.string().url().max(2048).optional(),
  network: z.enum(["stellar:testnet", "stellar:pubnet"]).optional(),
  asset: contractAddress.optional(),
  amount: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .optional(),
  payTo: stellarAddress.optional(),
  mimeType: z.string().min(3).max(120).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  secretId: z.string().uuid().nullable().optional(),
  authType: z.enum(["none", "header", "bearer"]).optional(),
  authHeader: z.string().min(1).max(100).nullable().optional(),
  enabled: z.boolean().optional(),
  requestsPerMinute: z.number().int().min(1).max(10000).optional(),
  monthlyRequestQuota: z.number().int().min(1).max(100000000).optional(),
  maxRequestBytes: z.number().int().min(0).max(10485760).optional(),
  maxResponseBytes: z.number().int().min(1024).max(52428800).optional(),
});

export type OwnerRequest = AuthRequest;
export const requireGatewayOwner = requireOwner;

function publicWrapper(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    upstreamUrl: row.upstream_url,
    network: row.network,
    scheme: row.scheme,
    asset: row.asset,
    amount: row.amount,
    payTo: row.pay_to,
    mimeType: row.mime_type,
    tags: row.tags,
    secretId: row.secret_id,
    authType: row.auth_type,
    authHeader: row.auth_header,
    enabled: row.enabled,
    requestsPerMinute: row.requests_per_minute,
    monthlyRequestQuota: row.monthly_request_quota,
    maxRequestBytes: row.max_request_bytes,
    maxResponseBytes: row.max_response_bytes,
    endpoint: `${env.PUBLIC_BASE_URL}/gateway/${row.slug}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export async function createSecret(
  ownerId: string,
  input: z.infer<typeof secretInput>,
) {
  const id = randomUUID();
  const encrypted = encryptValue(
    Buffer.from(input.value),
    `autolayer:gateway-secret:${id}`,
    { key: env.masterKey, version: env.KEY_ENCRYPTION_VERSION },
  );
  await pool.query(
    "INSERT INTO gateway_secrets(id,owner_id,name,encrypted_value) VALUES($1,$2,$3,$4::jsonb)",
    [id, ownerId, input.name, JSON.stringify(encrypted)],
  );
  return { id, name: input.name, createdAt: new Date().toISOString() };
}
export async function listSecrets(ownerId: string) {
  const result = await pool.query(
    "SELECT id,name,created_at,updated_at FROM gateway_secrets WHERE owner_id=$1 ORDER BY created_at DESC",
    [ownerId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
export async function deleteSecret(ownerId: string, id: string) {
  const result = await pool.query(
    "DELETE FROM gateway_secrets WHERE id=$1 AND owner_id=$2",
    [id, ownerId],
  );
  if (!result.rowCount) throw new Error("Secret not found");
}
async function validateSecret(ownerId: string, id: string | null) {
  if (!id) return;
  const found = await pool.query(
    "SELECT 1 FROM gateway_secrets WHERE id=$1 AND owner_id=$2",
    [id, ownerId],
  );
  if (!found.rowCount)
    throw new Error("Secret not found or not owned by caller");
}
export async function createWrapper(
  ownerId: string,
  input: z.infer<typeof wrapperInput>,
) {
  await assertSafeUpstream(input.upstreamUrl);
  await validateSecret(ownerId, input.secretId);
  let result;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const resolved = await suggestWrapperSlug(input.name, input.slug);
    const values = [
      randomUUID(),
      ownerId,
      resolved.slug,
      input.name,
      input.description,
      input.upstreamUrl,
      input.network,
      input.asset,
      input.amount,
      input.payTo,
      input.mimeType,
      input.tags,
      input.secretId,
      input.authType,
      input.authHeader,
      input.enabled,
      input.requestsPerMinute,
      input.monthlyRequestQuota,
      input.maxRequestBytes,
      input.maxResponseBytes,
    ];
    try {
      result = await pool.query(
        `INSERT INTO gateway_wrappers(id,owner_id,slug,name,description,upstream_url,network,asset,amount,pay_to,mime_type,tags,secret_id,auth_type,auth_header,enabled,requests_per_minute,monthly_request_quota,max_request_bytes,max_response_bytes) VALUES(${values.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
        values,
      );
      break;
    } catch (error) {
      if ((error as { code?: string }).code !== "23505" || attempt === 2)
        throw error;
    }
  }
  if (!result) throw new Error("Could not create wrapper");
  await upsertGatewayResource(result.rows[0]);
  return publicWrapper(result.rows[0]);
}
export function slugifyWrapperName(name: string) {
  const normalized = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return normalized.length >= 3
    ? normalized
    : `${normalized || "api"}-api`.slice(0, 63);
}
export async function suggestWrapperSlug(name: string, requested?: string) {
  const base = slugifyWrapperName(requested || name);
  const result = await pool.query(
    "SELECT slug FROM gateway_wrappers WHERE slug=$1 OR slug LIKE $2",
    [base, `${base.slice(0, 54)}-%`],
  );
  const used = new Set(result.rows.map((row) => String(row.slug)));
  if (!used.has(base)) return { slug: base, available: true, modified: false };
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${base.slice(0, 62 - String(suffix).length)}-${suffix}`;
    if (!used.has(candidate))
      return { slug: candidate, available: true, modified: true };
  }
  throw new Error("Could not allocate a unique endpoint slug");
}
export async function listWrappers(ownerId: string) {
  const result = await pool.query(
    "SELECT * FROM gateway_wrappers WHERE owner_id=$1 ORDER BY created_at DESC",
    [ownerId],
  );
  return result.rows.map(publicWrapper);
}
export async function getOwnedWrapper(ownerId: string, id: string) {
  const result = await pool.query(
    "SELECT * FROM gateway_wrappers WHERE id=$1 AND owner_id=$2",
    [id, ownerId],
  );
  if (!result.rowCount) throw new Error("Wrapper not found");
  return result.rows[0] as Record<string, unknown>;
}
export async function updateWrapper(
  ownerId: string,
  id: string,
  patch: z.infer<typeof wrapperPatch>,
) {
  const current = await getOwnedWrapper(ownerId, id);
  const merged = wrapperInput.parse({
    slug: current.slug,
    name: current.name,
    description: current.description,
    upstreamUrl: current.upstream_url,
    network: current.network,
    asset: current.asset,
    amount: current.amount,
    payTo: current.pay_to,
    mimeType: current.mime_type,
    tags: current.tags,
    secretId: current.secret_id,
    authType: current.auth_type,
    authHeader: current.auth_header,
    enabled: current.enabled,
    requestsPerMinute: current.requests_per_minute,
    monthlyRequestQuota: current.monthly_request_quota,
    maxRequestBytes: current.max_request_bytes,
    maxResponseBytes: current.max_response_bytes,
    ...patch,
  });
  await assertSafeUpstream(merged.upstreamUrl);
  await validateSecret(ownerId, merged.secretId);
  const result = await pool.query(
    `UPDATE gateway_wrappers SET name=$3,description=$4,upstream_url=$5,network=$6,asset=$7,amount=$8,pay_to=$9,mime_type=$10,tags=$11,secret_id=$12,auth_type=$13,auth_header=$14,enabled=$15,requests_per_minute=$16,monthly_request_quota=$17,max_request_bytes=$18,max_response_bytes=$19,updated_at=NOW() WHERE id=$1 AND owner_id=$2 RETURNING *`,
    [
      id,
      ownerId,
      merged.name,
      merged.description,
      merged.upstreamUrl,
      merged.network,
      merged.asset,
      merged.amount,
      merged.payTo,
      merged.mimeType,
      merged.tags,
      merged.secretId,
      merged.authType,
      merged.authHeader,
      merged.enabled,
      merged.requestsPerMinute,
      merged.monthlyRequestQuota,
      merged.maxRequestBytes,
      merged.maxResponseBytes,
    ],
  );
  if (merged.enabled) await upsertGatewayResource(result.rows[0]);
  else await removeGatewayResource(String(current.slug));
  return publicWrapper(result.rows[0]);
}
export async function deleteWrapper(ownerId: string, id: string) {
  const row = await getOwnedWrapper(ownerId, id);
  await pool.query("DELETE FROM gateway_wrappers WHERE id=$1 AND owner_id=$2", [
    id,
    ownerId,
  ]);
  await removeGatewayResource(String(row.slug));
}

function blockedIp(address: string) {
  if (isIP(address) === 4) {
    const p = address.split(".").map(Number);
    const first = p[0] ?? 0,
      second = p[1] ?? 0;
    return (
      first === 10 ||
      first === 127 ||
      first === 0 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    );
  }
  const value = address.toLowerCase();
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("::ffff:")
  );
}
export async function assertSafeUpstream(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:")
    throw new Error("Only HTTPS upstreams are allowed");
  if (url.username || url.password)
    throw new Error("Credentials are not allowed in upstream URLs");
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal")
  )
    throw new Error("Private upstream hostnames are not allowed");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => blockedIp(item.address)))
    throw new Error("Upstream resolves to a private or reserved address");
  return url;
}
type GatewayFetchInit = Omit<
  NonNullable<Parameters<typeof undiciFetch>[1]>,
  "body"
> & {
  body:
    | Buffer
    | NonNullable<NonNullable<Parameters<typeof undiciFetch>[1]>["body"]>
    | undefined;
};
async function fetch(input: URL, init: GatewayFetchInit) {
  const addresses = await lookup(input.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => blockedIp(item.address)))
    throw new Error("Upstream DNS changed to a private or reserved address");
  const pinned = addresses[0]!;
  const dispatcher = new Agent({
    connect: {
      lookup(_hostname, _options, callback) {
        callback(null, pinned.address, pinned.family);
      },
    },
  });
  const { body, ...rest } = init;
  try {
    return await undiciFetch(
      input,
      body === undefined
        ? { ...rest, dispatcher }
        : {
            ...rest,
            body: body as NonNullable<
              NonNullable<Parameters<typeof undiciFetch>[1]>["body"]
            >,
            dispatcher,
          },
    );
  } finally {
    await dispatcher.close();
  }
}
function requirements(row: Record<string, unknown>): PaymentRequirements {
  return {
    scheme: "exact",
    network: String(row.network),
    asset: String(row.asset),
    amount: String(row.amount),
    payTo: String(row.pay_to),
    maxTimeoutSeconds: 60,
    extra: { areFeesSponsored: true },
  } as PaymentRequirements;
}
function paymentRequired(
  row: Record<string, unknown>,
  resourceUrl: string,
): PaymentRequired {
  const req = requirements(row);
  return {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: resourceUrl,
      description: String(row.description || row.name),
      mimeType: String(row.mime_type),
    },
    accepts: [req],
    extensions: declareDiscoveryExtension({
      input: { type: "http" },
      inputSchema: { properties: {}, required: [] },
      output: { example: { status: "paid" } },
    }),
  } as PaymentRequired;
}
async function logRequest(
  row: Record<string, unknown>,
  requestId: string,
  method: string,
  path: string,
  outcome: string,
  start: number,
  status: number,
  requestBytes = 0,
  responseBytes = 0,
  errorCode: string | null = null,
  ip = "",
) {
  await pool.query(
    `INSERT INTO gateway_requests(id,wrapper_id,owner_id,request_id,method,path,status_code,outcome,duration_ms,request_bytes,response_bytes,client_ip_hash,error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      randomUUID(),
      row.id,
      row.owner_id,
      requestId,
      method,
      path,
      status,
      outcome,
      Date.now() - start,
      requestBytes,
      responseBytes,
      ip ? createHash("sha256").update(ip).digest("hex") : null,
      errorCode,
    ],
  );
}
async function enforceQuota(row: Record<string, unknown>) {
  const result = await pool.query(
    `WITH periods(kind,bucket) AS (VALUES ('minute',date_trunc('minute',NOW())),('month',date_trunc('month',NOW()))),counts AS (INSERT INTO gateway_quota_counters(wrapper_id,period_kind,period_start,request_count) SELECT $1,kind,bucket,1 FROM periods ON CONFLICT(wrapper_id,period_kind,period_start) DO UPDATE SET request_count=gateway_quota_counters.request_count+1 RETURNING period_kind,request_count) SELECT max(request_count) FILTER(WHERE period_kind='minute')::int minute_count,max(request_count) FILTER(WHERE period_kind='month')::int month_count FROM counts`,
    [row.id],
  );
  return {
    rate: result.rows[0].minute_count > Number(row.requests_per_minute),
    quota: result.rows[0].month_count > Number(row.monthly_request_quota),
  };
}
async function upstreamHeaders(row: Record<string, unknown>, request: Request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (
      typeof value === "string" &&
      ![
        "host",
        "authorization",
        "x-api-key",
        "payment-signature",
        "payment",
        "connection",
        "content-length",
      ].includes(key.toLowerCase())
    )
      headers.set(key, value);
  }
  if (row.secret_id) {
    const result = await pool.query(
      "SELECT encrypted_value FROM gateway_secrets WHERE id=$1 AND owner_id=$2",
      [row.secret_id, row.owner_id],
    );
    if (!result.rowCount)
      throw new Error("Configured gateway secret is unavailable");
    const value = decryptValue(
      result.rows[0].encrypted_value,
      `autolayer:gateway-secret:${row.secret_id}`,
      { key: env.masterKey, version: env.KEY_ENCRYPTION_VERSION },
    ).toString();
    if (row.auth_type === "bearer")
      headers.set("authorization", `Bearer ${value}`);
    else if (row.auth_type === "header")
      headers.set(String(row.auth_header), value);
  }
  return headers;
}
export async function proxyGateway(request: Request, response: Response) {
  const start = Date.now(),
    requestId = request.header("x-request-id") || randomUUID(),
    slugValue = request.params.slug;
  response.setHeader("x-request-id", requestId);
  const found = await pool.query(
    "SELECT * FROM gateway_wrappers WHERE slug=$1",
    [slugValue],
  );
  if (!found.rowCount)
    return response.status(404).json({
      error: "Wrapper not found",
      code: "WRAPPER_NOT_FOUND",
      requestId,
    });
  const row = found.rows[0] as Record<string, unknown>;
  if (!row.enabled)
    return response.status(404).json({
      error: "Wrapper is disabled",
      code: "WRAPPER_DISABLED",
      requestId,
    });
  const path = request.params.splat
    ? Array.isArray(request.params.splat)
      ? request.params.splat.join("/")
      : request.params.splat
    : "";
  const requestBody = Buffer.isBuffer(request.body)
    ? request.body
    : request.body && Object.keys(request.body as object).length
      ? Buffer.from(JSON.stringify(request.body))
      : undefined;
  if (requestBody && requestBody.length > Number(row.max_request_bytes)) {
    await logRequest(
      row,
      requestId,
      request.method,
      path,
      "GATEWAY_ERROR",
      start,
      413,
      requestBody.length,
      0,
      "REQUEST_TOO_LARGE",
    );
    return response.status(413).json({
      error: "Request body exceeds wrapper limit",
      code: "REQUEST_TOO_LARGE",
      requestId,
    });
  }
  const quota = await enforceQuota(row);
  if (quota.rate || quota.quota) {
    const outcome = quota.rate ? "RATE_LIMITED" : "QUOTA_EXCEEDED",
      status = quota.rate ? 429 : 403;
    await logRequest(
      row,
      requestId,
      request.method,
      path,
      outcome,
      start,
      status,
    );
    if (quota.rate) response.setHeader("retry-after", "60");
    return response.status(status).json({
      error: quota.rate
        ? "Rate limit exceeded"
        : "Monthly request quota exceeded",
      code: outcome,
      requestId,
    });
  }
  const resourceUrl = `${env.PUBLIC_BASE_URL}/gateway/${slugValue}${path ? `/${path}` : ""}`;
  const signature =
    request.header("payment-signature") || request.header("payment");
  if (!signature) {
    const required = paymentRequired(row, resourceUrl);
    response.setHeader(
      "PAYMENT-REQUIRED",
      encodePaymentRequiredHeader(required),
    );
    response.setHeader("cache-control", "private, no-store");
    await logRequest(
      row,
      requestId,
      request.method,
      path,
      "CHALLENGED",
      start,
      402,
    );
    return response.status(402).json(required);
  }
  let payload: PaymentPayload;
  try {
    payload = decodePaymentSignatureHeader(signature);
  } catch {
    await logRequest(
      row,
      requestId,
      request.method,
      path,
      "VERIFY_FAILED",
      start,
      400,
      0,
      0,
      "INVALID_PAYMENT_HEADER",
    );
    return response.status(400).json({
      error: "Invalid PAYMENT-SIGNATURE header",
      code: "INVALID_PAYMENT_HEADER",
      requestId,
    });
  }
  const reqs = requirements(row);
  const verified = await facilitator.verify(payload, reqs);
  if (!verified.isValid) {
    await logRequest(
      row,
      requestId,
      request.method,
      path,
      "VERIFY_FAILED",
      start,
      402,
      0,
      0,
      verified.invalidReason || "PAYMENT_VERIFICATION_FAILED",
    );
    return response.status(402).json({
      error: verified.invalidReason || "Payment verification failed",
      code: "PAYMENT_VERIFICATION_FAILED",
      reason: verified.invalidReason || "UNKNOWN",
      requestId,
    });
  }
  const settled = await facilitator.settle(payload, reqs);
  if (!settled.success) {
    await logRequest(
      row,
      requestId,
      request.method,
      path,
      "SETTLE_FAILED",
      start,
      402,
      0,
      0,
      settled.errorReason || "PAYMENT_SETTLEMENT_FAILED",
    );
    return response.status(402).json({
      error: settled.errorReason || "Payment settlement failed",
      code: "PAYMENT_SETTLEMENT_FAILED",
      reason: settled.errorReason || "UNKNOWN",
      requestId,
    });
  }
  const tx = settled.transaction;
  if (!tx) throw new Error("Settlement succeeded without a transaction hash");
  await pool.query(
    `INSERT INTO gateway_payments(id,wrapper_id,request_id,network,asset,amount,pay_to,payer,transaction_hash,status,facilitator_response) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SETTLED',$10::jsonb) ON CONFLICT(transaction_hash) DO NOTHING`,
    [
      randomUUID(),
      row.id,
      requestId,
      row.network,
      row.asset,
      row.amount,
      row.pay_to,
      null,
      tx,
      JSON.stringify(settled),
    ],
  );
  try {
    const base = await assertSafeUpstream(String(row.upstream_url));
    const target = new URL(base);
    target.pathname = `${base.pathname.replace(/\/$/, "")}${path ? `/${path}` : ""}`;
    target.search = request.url.includes("?")
      ? request.url.slice(request.url.indexOf("?"))
      : "";
    const upstream = await fetch(target, {
      method: request.method,
      headers: await upstreamHeaders(row, request),
      body: ["GET", "HEAD"].includes(request.method) ? undefined : requestBody,
      redirect: "manual",
      signal: AbortSignal.timeout(env.HTTP_TIMEOUT_MS),
    });
    if (upstream.status >= 300 && upstream.status < 400)
      throw new Error("Upstream redirects are disabled");
    const data = Buffer.from(await upstream.arrayBuffer());
    if (data.length > Number(row.max_response_bytes))
      throw new Error("Upstream response exceeds wrapper limit");
    for (const [key, value] of upstream.headers) {
      if (
        ![
          "connection",
          "transfer-encoding",
          "content-length",
          "set-cookie",
        ].includes(key.toLowerCase())
      )
        response.setHeader(key, value);
    }
    response.setHeader(
      "PAYMENT-RESPONSE",
      encodePaymentResponseHeader(settled),
    );
    response.setHeader("cache-control", "private, no-store");
    await logRequest(
      row,
      requestId,
      request.method,
      path,
      upstream.ok ? "UPSTREAM_SUCCESS" : "UPSTREAM_ERROR",
      start,
      upstream.status,
      requestBody?.length || 0,
      data.length,
    );
    return response.status(upstream.status).send(data);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Upstream request failed";
    await logRequest(
      row,
      requestId,
      request.method,
      path,
      "GATEWAY_ERROR",
      start,
      502,
      requestBody?.length || 0,
      0,
      "UPSTREAM_FAILED",
    );
    return response.status(502).json({
      error: detail,
      code: "UPSTREAM_FAILED",
      requestId,
      paymentTransaction: tx,
    });
  }
}
export async function gatewayAnalytics(ownerId: string, id: string) {
  await getOwnedWrapper(ownerId, id);
  const summary = await pool.query(
    `SELECT count(*)::int requests,count(*) FILTER(WHERE outcome='UPSTREAM_SUCCESS')::int successful,coalesce(avg(duration_ms),0)::int average_latency_ms,coalesce(sum(response_bytes),0)::bigint response_bytes FROM gateway_requests WHERE wrapper_id=$1`,
    [id],
  );
  const payments = await pool.query(
    "SELECT network,asset,amount,pay_to,transaction_hash,status,settled_at FROM gateway_payments WHERE wrapper_id=$1 ORDER BY settled_at DESC LIMIT 100",
    [id],
  );
  const logs = await pool.query(
    "SELECT request_id,method,path,status_code,outcome,duration_ms,request_bytes,response_bytes,error_code,created_at FROM gateway_requests WHERE wrapper_id=$1 ORDER BY created_at DESC LIMIT 100",
    [id],
  );
  return {
    summary: summary.rows[0],
    requests: logs.rows,
    payments: payments.rows,
  };
}
