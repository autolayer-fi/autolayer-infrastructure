import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  extractDiscoveryInfo,
  isValidRouteTemplate,
  validateDiscoveryExtension,
  validateDiscoveryExtensionSpec,
} from "@x402/extensions/bazaar";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";

export type CatalogOutcome = { success: true; resource: string } | { success: false; reason: string };

export function encodeCatalogOutcome(outcome: CatalogOutcome): string {
  const bazaar = outcome.success
    ? { status: "success" as const }
    : { status: "rejected" as const, rejectedReason: outcome.reason };
  return Buffer.from(JSON.stringify({ bazaar })).toString("base64");
}

const allowedNetworks = new Set(["stellar:testnet", "stellar:pubnet"]);
const allowedSchemes = new Set(["exact", "upto"]);

function safeResourceUrl(value: string): URL {
  if (value.length > 2048) throw new Error("resource.url exceeds 2048 characters");
  const url = new URL(value);
  if (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && url.protocol === "http:")) {
    throw new Error("resource.url must use HTTPS");
  }
  if (url.username || url.password || url.hash) throw new Error("resource.url must not contain credentials or a fragment");
  return url;
}

export function validateCatalogPayload(payload: PaymentPayload, requirements: PaymentRequirements): void {
  if (payload.x402Version !== 2) throw new Error("Only x402 v2 resources are cataloged");
  if (!payload.resource?.url) throw new Error("resource.url is required");
  safeResourceUrl(payload.resource.url);
  if (!allowedNetworks.has(requirements.network)) throw new Error("Only Stellar testnet and pubnet resources are cataloged");
  if (!allowedSchemes.has(requirements.scheme)) throw new Error("Unsupported Stellar payment scheme");
  if (!/^[1-9][0-9]*$/.test(requirements.amount)) throw new Error("amount must be positive integer base units");
  if (!/^[GC][A-Z2-7]{55}$/.test(requirements.payTo)) throw new Error("payTo must be a Stellar account or contract address");
  if (!/^C[A-Z2-7]{55}$/.test(requirements.asset)) throw new Error("asset must be a SEP-41 contract address");
  const accepted = payload.accepted;
  for (const field of ["scheme", "network", "asset", "amount", "payTo", "maxTimeoutSeconds"] as const) {
    if (accepted[field] !== requirements[field]) throw new Error(`accepted.${field} does not match settled requirements`);
  }
  const raw = payload.extensions?.bazaar;
  if (!raw || typeof raw !== "object") throw new Error("No Bazaar discovery extension was supplied");
  const extension = raw as unknown as Parameters<typeof validateDiscoveryExtension>[0];
  const schemaResult = validateDiscoveryExtension(extension);
  if (!schemaResult.valid) throw new Error(`Discovery schema validation failed: ${schemaResult.errors?.join("; ")}`);
  const specResult = validateDiscoveryExtensionSpec(raw as Record<string, unknown>);
  if (!specResult.valid) throw new Error(`Discovery specification validation failed: ${specResult.errors?.join("; ")}`);
  const routeTemplate = (raw as Record<string, unknown>).routeTemplate;
  if (routeTemplate !== undefined && (typeof routeTemplate !== "string" || !isValidRouteTemplate(routeTemplate))) {
    throw new Error("Invalid routeTemplate after percent-decoding and traversal checks");
  }
}

export async function catalogPayment(payload: PaymentPayload, requirements: PaymentRequirements): Promise<CatalogOutcome> {
  try {
    validateCatalogPayload(payload, requirements);
    const discovered = extractDiscoveryInfo(payload, requirements, true);
    if (!discovered) return { success: false, reason: "No valid bazaar discovery extension was supplied" };
    const input = discovered.discoveryInfo.input;
    const type = input.type;
    const toolName = type === "mcp" ? input.toolName : null;
    const key = type === "mcp" ? `${discovered.resourceUrl}#${toolName}` : discovered.resourceUrl;
    const existing = await pool.query("SELECT accepts FROM bazaar_resources WHERE resource_key=$1", [key]);
    if (existing.rowCount) {
      const prior = (existing.rows[0].accepts as PaymentRequirements[])[0];
      if (prior?.payTo !== requirements.payTo) {
        return { success: false, reason: "Listing payTo is immutable; ownership transfer requires operator review" };
      }
    }
    await pool.query(
      `INSERT INTO bazaar_resources
       (resource_key, resource_url, resource_type, tool_name, x402_version, description, mime_type, service_name, tags, accepts, extensions, discovery_info)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb)
       ON CONFLICT (resource_key) DO UPDATE SET
         x402_version=EXCLUDED.x402_version, description=EXCLUDED.description, mime_type=EXCLUDED.mime_type,
         service_name=EXCLUDED.service_name, tags=EXCLUDED.tags, accepts=EXCLUDED.accepts,
         extensions=EXCLUDED.extensions, discovery_info=EXCLUDED.discovery_info,
         settlement_count=bazaar_resources.settlement_count + 1, last_updated=NOW()`,
      [key, discovered.resourceUrl, type, toolName, discovered.x402Version, discovered.description ?? null,
        discovered.mimeType ?? null, discovered.serviceName ?? null, discovered.tags ?? [], JSON.stringify([requirements]),
        JSON.stringify(discovered.extensions ?? {}), JSON.stringify(discovered.discoveryInfo)]
    );
    return { success: true, resource: key };
  } catch (error) {
    return { success: false, reason: error instanceof Error ? error.message : "Discovery metadata validation failed" };
  }
}

interface Filters { type?: string | undefined; payTo?: string | undefined; scheme?: string | undefined; network?: string | undefined; extensions?: string | undefined; limit: number; offset: number }
function clauses(filters: Filters, start = 1) {
  const sql: string[] = []; const values: unknown[] = [];
  const add = (fragment: string, value: unknown) => { values.push(value); sql.push(fragment.replace("?", `$${start + values.length - 1}`)); };
  if (filters.type) add("resource_type = ?", filters.type);
  if (filters.payTo) add("accepts @> ?::jsonb", JSON.stringify([{ payTo: filters.payTo }]));
  if (filters.scheme) add("accepts @> ?::jsonb", JSON.stringify([{ scheme: filters.scheme }]));
  if (filters.network) add("accepts @> ?::jsonb", JSON.stringify([{ network: filters.network }]));
  if (filters.extensions) add("jsonb_exists(extensions, ?)", filters.extensions);
  return { where: sql.length ? `WHERE ${sql.join(" AND ")}` : "", values };
}
function publicResource(row: Record<string, unknown>) { return { resource: row.resource_url, type: row.resource_type, x402Version: row.x402_version, accepts: row.accepts, lastUpdated: Math.floor(new Date(row.last_updated as string).getTime() / 1000), description: row.description ?? undefined, mimeType: row.mime_type ?? undefined, serviceName: row.service_name ?? undefined, tags: row.tags, extensions: row.extensions }; }

export async function listResources(filters: Filters) {
  const q = clauses(filters); const count = await pool.query(`SELECT count(*)::int AS total FROM bazaar_resources ${q.where}`, q.values);
  const values = [...q.values, filters.limit, filters.offset];
  const rows = await pool.query(`SELECT * FROM bazaar_resources ${q.where} ORDER BY last_updated DESC LIMIT $${q.values.length+1} OFFSET $${q.values.length+2}`, values);
  return { x402Version: 2, items: rows.rows.map(publicResource), pagination: { limit: filters.limit, offset: filters.offset, total: count.rows[0].total } };
}

export async function searchResources(query: string, filters: Filters) {
  const cursorOffset = filters.offset; const q = clauses(filters, 2);
  // Natural-language discovery should retrieve resources matching any meaningful
  // query term, then rank exact/multi-term matches above partial matches.
  const anyTermQuery = "to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', $1)), ' | '))";
  const where = [`search_vector @@ ${anyTermQuery}`, ...(q.where ? [q.where.slice(6)] : [])].join(" AND ");
  const values = [query, ...q.values, filters.limit + 1, cursorOffset];
  const rows = await pool.query(`SELECT *, (2 * ts_rank_cd(search_vector, websearch_to_tsquery('english', $1), 32) + ts_rank_cd(search_vector, ${anyTermQuery}, 32)) AS rank FROM bazaar_resources WHERE ${where} ORDER BY rank DESC, ln(1 + settlement_count) DESC, last_updated DESC, resource_key ASC LIMIT $${2+q.values.length} OFFSET $${3+q.values.length}`, values);
  const partialResults = rows.rows.length > filters.limit; const page = rows.rows.slice(0, filters.limit);
  return { x402Version: 2, resources: page.map(publicResource), partialResults, pagination: { limit: filters.limit, cursor: partialResults ? Buffer.from(String(cursorOffset + filters.limit)).toString("base64url") : null } };
}

export async function isCatalogedResource(url: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM bazaar_resources WHERE resource_url = $1 LIMIT 1", [url]);
  return result.rowCount === 1;
}

export async function upsertGatewayResource(row: Record<string, unknown>): Promise<void> {
  const resourceUrl = `${env.PUBLIC_BASE_URL}/gateway/${row.slug}`;
  const requirements = { scheme: "exact", network: row.network, asset: row.asset, amount: row.amount, payTo: row.pay_to, maxTimeoutSeconds: 60, extra: { areFeesSponsored: true } };
  await pool.query(`INSERT INTO bazaar_resources(resource_key,resource_url,resource_type,x402_version,description,mime_type,service_name,tags,accepts,extensions,discovery_info) VALUES($1,$1,'http',2,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb) ON CONFLICT(resource_key) DO UPDATE SET description=EXCLUDED.description,mime_type=EXCLUDED.mime_type,service_name=EXCLUDED.service_name,tags=EXCLUDED.tags,accepts=EXCLUDED.accepts,extensions=EXCLUDED.extensions,discovery_info=EXCLUDED.discovery_info,last_updated=NOW()`,[resourceUrl,row.description,row.mime_type,row.name,row.tags,JSON.stringify([requirements]),JSON.stringify({bazaar:{}}),JSON.stringify({input:{type:"http"},inputSchema:{properties:{},required:[]},output:{example:{status:"paid"}}})]);
}

export async function removeGatewayResource(slug: string): Promise<void> {
  const resourceUrl = `${env.PUBLIC_BASE_URL}/gateway/${slug}`;
  await pool.query("DELETE FROM bazaar_resources WHERE resource_key=$1",[resourceUrl]);
}
