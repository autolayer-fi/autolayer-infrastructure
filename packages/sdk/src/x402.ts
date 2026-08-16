export type StellarNetwork = "stellar:testnet" | "stellar:pubnet";

export interface BazaarResource {
  resource: string;
  type: "http" | "mcp";
  x402Version: number;
  accepts: Array<Record<string, unknown>>;
  lastUpdated: number;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
  extensions?: Record<string, unknown>;
}

export interface BazaarSearchResponse {
  x402Version: 2;
  resources: BazaarResource[];
  partialResults: boolean;
  pagination: { limit: number; cursor: string | null } | null;
}

export interface BazaarListResponse {
  x402Version: 2;
  items: BazaarResource[];
  pagination: { limit: number; offset: number; total: number };
}

export interface DiscoveryParameter {
  type: "string" | "number" | "integer" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  enum?: unknown[];
  example?: unknown;
}

export function declareHttpDiscovery(config: {
  method: "GET" | "HEAD" | "DELETE" | "POST" | "PUT" | "PATCH";
  parameters?: Record<string, DiscoveryParameter>;
  bodyType?: "json" | "form-data" | "text";
  outputExample?: unknown;
}) {
  const parameters = config.parameters ?? {};
  const properties = Object.fromEntries(Object.entries(parameters).map(([name, value]) => [name, {
    type: value.type, description: value.description, ...(value.enum ? { enum: value.enum } : {}),
  }]));
  const required = Object.entries(parameters).filter(([, value]) => value.required).map(([name]) => name);
  const examples = Object.fromEntries(Object.entries(parameters).filter(([, value]) => value.example !== undefined).map(([name, value]) => [name, value.example]));
  const bodyMethod = ["POST", "PUT", "PATCH"].includes(config.method);
  const input = bodyMethod
    ? { type: "http", method: config.method, bodyType: config.bodyType ?? "json", body: examples }
    : { type: "http", method: config.method, queryParams: examples };
  return { bazaar: { info: { input, output: { type: "json", example: config.outputExample } }, schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: {
      input: { type: "object", properties: {
        type: { type: "string", const: "http" }, method: { type: "string", const: config.method },
        ...(bodyMethod ? { bodyType: { type: "string", enum: ["json", "form-data", "text"] }, body: { type: "object", properties, required } } : { queryParams: { type: "object", properties, required } }),
      }, required: bodyMethod ? ["type", "method", "bodyType", "body"] : ["type", "method"], additionalProperties: false },
      output: { type: "object" },
    }, required: ["input"] }, } };
}

export type PaymentAuthorization = (paymentRequired: Record<string, unknown>, context: { url: string; method: string }) => Promise<string>;

export class StellarBazaarClient {
  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch) {}

  async list(params: { type?: "http" | "mcp"; payTo?: string; scheme?: string; network?: StellarNetwork; extensions?: string; limit?: number; offset?: number } = {}): Promise<BazaarListResponse> {
    return this.get("/discovery/resources", params) as Promise<BazaarListResponse>;
  }

  async search(query: string, params: { type?: "http" | "mcp"; payTo?: string; scheme?: string; network?: StellarNetwork; extensions?: string; limit?: number; cursor?: string } = {}): Promise<BazaarSearchResponse> {
    if (!query.trim()) throw new Error("query is required");
    return this.get("/discovery/search", { query, ...params }) as Promise<BazaarSearchResponse>;
  }

  async paidCall(url: string, authorize: PaymentAuthorization, init: RequestInit = {}): Promise<Response> {
    const first = await this.fetcher(url, init);
    if (first.status !== 402) return first;
    const encoded = first.headers.get("PAYMENT-REQUIRED");
    if (!encoded) throw new Error("PAYMENT_REQUIRED_HEADER_MISSING");
    let paymentRequired: Record<string, unknown>;
    try { paymentRequired = JSON.parse(decodeBase64(encoded)); } catch { throw new Error("PAYMENT_REQUIRED_HEADER_INVALID"); }
    const signature = await authorize(paymentRequired, { url, method: init.method ?? "GET" });
    if (!signature) throw new Error("PAYMENT_AUTHORIZATION_EMPTY");
    const headers = new Headers(init.headers);
    headers.set("PAYMENT-SIGNATURE", signature);
    return this.fetcher(url, { ...init, headers });
  }

  private async get(path: string, params: Record<string, unknown>): Promise<unknown> {
    const url = new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await this.fetcher(url);
    if (!response.ok) throw new Error(`Bazaar request failed: ${response.status}`);
    return response.json();
  }
}

function decodeBase64(value: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "base64").toString("utf8");
  return atob(value);
}
