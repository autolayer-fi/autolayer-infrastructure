import { describe, expect, it } from "vitest";
import { mcpTools } from "../src/api/mcp.routes.js";

describe("agent-facing MCP contract", () => {
  it("publishes deterministic search and paid-call tools", () => {
    expect(mcpTools.map(tool => tool.name)).toEqual(["search_services", "paid_call"]);
    expect(mcpTools.every(tool => tool.inputSchema.type === "object")).toBe(true);
  });

  it("allows challenge inspection before wallet signing", () => {
    const paidCall = mcpTools.find(tool => tool.name === "paid_call")!;
    expect(paidCall.inputSchema.required).toEqual(["url"]);
    expect(paidCall.inputSchema.properties.paymentSignature).toBeDefined();
  });

  it("uses bounded Stellar search inputs", () => {
    const search = mcpTools.find(tool => tool.name === "search_services")!;
    expect(search.inputSchema.properties.network.enum).toEqual(["stellar:testnet", "stellar:pubnet"]);
    expect(search.inputSchema.properties.limit.maximum).toBe(50);
  });
});
