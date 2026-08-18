import USDC from "../constants/assets.js";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";

export interface DiscoverableWrapper {
  slug: string;
  name: string;
  description: string | null;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  network: "stellar:testnet" | "stellar:pubnet";
  asset: string;
  amount: string;
  mime_type: string;
  tags: string[];
}

const usdcByNetwork = {
  "stellar:testnet": USDC.TESTNET,
  "stellar:pubnet": USDC.PUBLIC,
} as const;

export function atomicUnitsToDecimal(amount: string, decimals = 7): string {
  if (!/^[0-9]+$/.test(amount)) throw new Error("amount must contain only digits");
  const normalized = amount.replace(/^0+(?=\d)/, "");
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals);
  return `${whole}.${fraction}`;
}

function operationId(slug: string): string {
  const words = slug.split("-").filter(Boolean);
  return [words[0] ?? "resource", ...words.slice(1).map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)].join("");
}

function responseSchema(mimeType: string): Record<string, unknown> {
  if (mimeType.includes("json")) return { type: "object", additionalProperties: true };
  if (mimeType.startsWith("text/")) return { type: "string" };
  return { type: "string", contentEncoding: "base64" };
}

export function buildOpenApiDocument(
  wrappers: DiscoverableWrapper[],
  baseUrl = env.PUBLIC_BASE_URL,
): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const wrapper of wrappers) {
    // x402scan's price is decimal USD. Do not mislabel arbitrary SEP-41
    // tokens as dollars; xWrapper's public console currently creates USDC
    // wrappers, and any custom-token rows remain available in AutoLayer Bazaar.
    if (wrapper.asset !== usdcByNetwork[wrapper.network]) continue;
    const path = `/gateway/${wrapper.slug}`;
    const operation: Record<string, unknown> = {
      operationId: operationId(wrapper.slug),
      summary: wrapper.name,
      description: wrapper.description || wrapper.name,
      tags: wrapper.tags,
      parameters: [],
      "x-payment-info": {
        price: {
          mode: "fixed",
          currency: "USD",
          amount: atomicUnitsToDecimal(wrapper.amount),
        },
        protocols: [{ x402: {} }],
      },
      "x-stellar-payment": {
        network: wrapper.network,
        asset: wrapper.asset,
        amount: wrapper.amount,
        decimals: 7,
        scheme: "exact",
        areFeesSponsored: true,
      },
      responses: {
        "200": {
          description: "Successful paid upstream response",
          content: {
            [wrapper.mime_type]: { schema: responseSchema(wrapper.mime_type) },
          },
        },
        "402": { description: "Payment Required" },
      },
    };
    if (["POST", "PUT", "PATCH"].includes(wrapper.method)) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      };
    }
    paths[path] = {
      [wrapper.method.toLowerCase()]: operation,
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "AutoLayer x402 APIs",
      version: "1.0.0",
      description: "Agent-payable APIs created with AutoLayer xWrapper and settled on Stellar.",
      "x-guidance": "Choose an operation, request it without credentials, read the canonical HTTP 402 payment requirements, authorize the Stellar payment, and retry with PAYMENT-SIGNATURE. Prices in x-payment-info are decimal USD; runtime accepts[].amount uses seven-decimal Stellar USDC atomic units.",
      contact: {
        name: "AutoLayer Support",
        email: env.DISCOVERY_CONTACT_EMAIL,
        url: env.DISCOVERY_CONTACT_URL,
      },
    },
    servers: [{ url: baseUrl.replace(/\/$/, "") }],
    paths,
  };
}

export const autoLayerFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#6ee7b7"/><circle cx="32" cy="32" r="15" fill="none" stroke="#06100d" stroke-width="5"/><path d="M10 32h44M32 10c7 7 10 14 10 22S39 47 32 54c-7-7-10-14-10-22s3-15 10-22Z" fill="none" stroke="#06100d" stroke-width="4"/></svg>`;

export function buildWellKnownDocument(
  wrappers: DiscoverableWrapper[],
  baseUrl = env.PUBLIC_BASE_URL,
): Record<string, unknown> {
  const origin = baseUrl.replace(/\/$/, "");
  return {
    version: 1,
    resources: wrappers
      .filter((wrapper) => wrapper.asset === usdcByNetwork[wrapper.network])
      .map((wrapper) => `${origin}/gateway/${wrapper.slug}`),
  };
}

export async function listDiscoverableWrappers(): Promise<DiscoverableWrapper[]> {
  const result = await pool.query(
    `SELECT slug,name,description,method,network,asset,amount,mime_type,tags
       FROM gateway_wrappers
      WHERE enabled=TRUE
      ORDER BY slug ASC`,
  );
  return result.rows as DiscoverableWrapper[];
}
