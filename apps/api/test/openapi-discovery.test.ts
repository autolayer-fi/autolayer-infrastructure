import { describe, expect, it } from "vitest";
import {
  atomicUnitsToDecimal,
  buildOpenApiDocument,
  buildWellKnownDocument,
  type DiscoverableWrapper,
} from "../src/services/openapi-discovery.js";

const wrapper: DiscoverableWrapper = {
  slug: "stellar-weather",
  name: "Stellar weather",
  description: "Current weather for agents",
  method: "GET",
  network: "stellar:testnet",
  asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  amount: "10000",
  mime_type: "application/json",
  tags: ["weather"],
};

describe("x402scan origin discovery", () => {
  it.each([
    ["1", "0.0000001"],
    ["10000", "0.0010000"],
    ["10000000", "1.0000000"],
    ["123456789", "12.3456789"],
  ])("converts Stellar atomic amount %s without floating point", (amount, expected) => {
    expect(atomicUnitsToDecimal(amount)).toBe(expected);
  });

  it("publishes an invocable OpenAPI operation with x402 and Stellar metadata", () => {
    const document = buildOpenApiDocument([wrapper], "https://core.autolayer.fi/") as {
      openapi: string;
      info: Record<string, unknown>;
      servers: Array<{ url: string }>;
      paths: Record<string, { get: Record<string, any> }>;
    };
    const operation = document.paths["/gateway/stellar-weather"]!.get;
    expect(document.openapi).toBe("3.1.0");
    expect(document.info["x-guidance"]).toBeTruthy();
    expect(document.servers).toEqual([{ url: "https://core.autolayer.fi" }]);
    expect(operation["x-payment-info"]).toEqual({
      price: { mode: "fixed", currency: "USD", amount: "0.0010000" },
      protocols: [{ x402: {} }],
    });
    expect(operation["x-stellar-payment"]).toMatchObject({
      network: "stellar:testnet",
      amount: "10000",
      decimals: 7,
    });
    expect(operation.responses).toHaveProperty("402");
    expect(operation.responses["200"].content["application/json"].schema).toEqual({
      type: "object",
      additionalProperties: true,
    });
  });

  it("fans out only known-USDC wrappers and does not leak upstream configuration", () => {
    const custom = { ...wrapper, slug: "custom-token", asset: `C${"A".repeat(55)}` };
    const openapi = buildOpenApiDocument([wrapper, custom], "https://core.autolayer.fi") as {
      paths: Record<string, unknown>;
    };
    const wellKnown = buildWellKnownDocument([wrapper, custom], "https://core.autolayer.fi") as {
      resources: string[];
    };
    expect(Object.keys(openapi.paths)).toEqual(["/gateway/stellar-weather"]);
    expect(wellKnown.resources).toEqual([
      "https://core.autolayer.fi/gateway/stellar-weather",
    ]);
    expect(JSON.stringify(openapi)).not.toContain("upstreamUrl");
    expect(JSON.stringify(openapi)).not.toContain("secretId");
  });

  it("publishes a request-body schema for body-bearing methods", () => {
    const post = { ...wrapper, slug: "weather-search", method: "POST" as const };
    const document = buildOpenApiDocument([post]) as {
      paths: Record<string, { post: Record<string, any> }>;
    };
    expect(
      document.paths["/gateway/weather-search"]!.post.requestBody.content[
        "application/json"
      ].schema,
    ).toEqual({ type: "object", additionalProperties: true });
  });
});
