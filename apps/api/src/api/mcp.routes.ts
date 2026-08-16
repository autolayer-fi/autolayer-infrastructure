import { Router, type Response, type Router as ExpressRouter } from "express";
import { isCatalogedResource, searchResources } from "../services/bazaar.js";
import { assertSafeUpstream } from "../services/gateway.js";

export const mcpRoutes: ExpressRouter = Router();
export const mcpTools = [
  { name: "search_services", description: "Search AutoLayer's Stellar service catalog using natural language.", inputSchema: { type: "object", properties: { query: { type: "string" }, network: { enum: ["stellar:testnet", "stellar:pubnet"] }, limit: { type: "integer", minimum: 1, maximum: 50 } }, required: ["query"] } },
  { name: "paid_call", description: "Inspect a cataloged endpoint's 402 terms, or retry it with a wallet-created payment signature.", inputSchema: { type: "object", properties: { url: { type: "string", format: "uri" }, paymentSignature: { type: "string", description: "Canonical base64 x402 PaymentPayload. Omit on the first call to receive paymentRequired." }, method: { enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] }, body: {} }, required: ["url"] } },
];
function reply(response: Response, id: unknown, result?: unknown, error?: {code:number;message:string;data:{reason:string}}) { return response.json(error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result }); }
mcpRoutes.post("/mcp", async (request, response) => {
  const { id, method, params } = request.body ?? {};
  if (method === "initialize") return reply(response, id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "autolayer-discovery", version: "1.0.0" } });
  if (method === "tools/list") return reply(response, id, { tools: mcpTools });
  if (method !== "tools/call") return reply(response, id, undefined, { code: -32601, message: "Method not found", data: { reason: "UNSUPPORTED_METHOD" } });
  const args = params?.arguments ?? {};
  if (params?.name === "search_services") {
    if (!args.query) return reply(response, id, undefined, { code: -32602, message: "query is required", data: { reason: "QUERY_REQUIRED" } });
    const results = await searchResources(String(args.query), { network: args.network, limit: Math.min(Number(args.limit)||10,50), offset: 0 });
    return reply(response, id, { content: [{ type: "text", text: JSON.stringify(results) }], structuredContent: results });
  }
  if (params?.name === "paid_call") {
    try {
      const url = new URL(String(args.url)); if (url.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
      await assertSafeUpstream(url.toString());
      if (!(await isCatalogedResource(url.toString()))) throw new Error("RESOURCE_NOT_CATALOGED");
      const method = String(args.method ?? "GET");
      const hasBody = ["POST", "PUT", "PATCH"].includes(method);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (args.paymentSignature) headers["PAYMENT-SIGNATURE"] = String(args.paymentSignature);
      const upstream = await fetch(url, { method, headers, ...(hasBody ? { body: JSON.stringify(args.body ?? {}) } : {}), redirect: "error", signal: AbortSignal.timeout(30_000) });
      const text = (await upstream.text()).slice(0, 5_242_880);
      const structuredContent = { status: upstream.status, body: text, paymentRequired: upstream.headers.get("PAYMENT-REQUIRED"), paymentResponse: upstream.headers.get("PAYMENT-RESPONSE"), nextAction: upstream.status === 402 ? "SIGN_PAYMENT_AND_RETRY" : "COMPLETE" };
      return reply(response, id, { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent });
    } catch (error) { return reply(response, id, undefined, { code: -32002, message: "Paid call failed", data: { reason: error instanceof Error ? error.message : "PAID_CALL_FAILED" } }); }
  }
  return reply(response, id, undefined, { code: -32602, message: "Unknown tool", data: { reason: "UNKNOWN_TOOL" } });
});
