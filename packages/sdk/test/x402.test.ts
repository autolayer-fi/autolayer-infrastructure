import { describe, expect, it, vi } from "vitest";
import { StellarBazaarClient, declareHttpDiscovery } from "../src/x402.js";

describe("x402 Bazaar SDK", () => {
  it("declares parameter descriptions in a valid HTTP discovery envelope", () => {
    const extension = declareHttpDiscovery({ method: "GET", parameters: {
      city: { type: "string", description: "City to forecast", required: true, example: "Lagos" },
    }, outputExample: { temperature: 28 } });
    expect(extension.bazaar.info.input).toMatchObject({ type: "http", method: "GET", queryParams: { city: "Lagos" } });
    expect(extension.bazaar.schema.properties.input.properties.queryParams.properties.city.description).toBe("City to forecast");
  });

  it("searches with canonical filters", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ x402Version: 2, resources: [], partialResults: false, pagination: null }), { status: 200 }));
    const client = new StellarBazaarClient("https://facilitator.example", fetcher as typeof fetch);
    await client.search("weather", { network: "stellar:testnet", limit: 5 });
    const url = String(fetcher.mock.calls[0]?.[0]);
    expect(url).toContain("query=weather");
    expect(url).toContain("network=stellar%3Atestnet");
  });

  it("wraps challenge, authorize, and retry", async () => {
    const required = Buffer.from(JSON.stringify({ x402Version: 2, accepts: [] })).toString("base64");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 402, headers: { "PAYMENT-REQUIRED": required } }))
      .mockResolvedValueOnce(new Response("paid", { status: 200 }));
    const authorize = vi.fn(async () => "signed-payment");
    const response = await new StellarBazaarClient("https://facilitator.example", fetcher as typeof fetch)
      .paidCall("https://seller.example/data", authorize);
    expect(await response.text()).toBe("paid");
    expect(authorize).toHaveBeenCalledOnce();
    const secondInit = fetcher.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(secondInit.headers).get("PAYMENT-SIGNATURE")).toBe("signed-payment");
  });
});
