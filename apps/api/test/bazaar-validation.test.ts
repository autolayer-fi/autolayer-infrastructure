import { describe, expect, it } from "vitest";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { validateCatalogPayload } from "../src/services/bazaar.js";

const requirements: PaymentRequirements = {
  scheme: "exact", network: "stellar:testnet", asset: `C${"A".repeat(55)}`,
  amount: "100000", payTo: `G${"B".repeat(55)}`, maxTimeoutSeconds: 60,
  extra: { areFeesSponsored: true },
};

function payload(routeTemplate?: string): PaymentPayload {
  return { x402Version: 2, resource: { url: "https://seller.example/weather/lagos" }, accepted: { ...requirements }, payload: { transaction: "AAAA" }, extensions: { bazaar: {
    info: { input: { type: "http", method: "GET", queryParams: { city: "Lagos" } }, output: { type: "json" } },
    schema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { input: { type: "object", properties: { type: { type: "string", const: "http" }, method: { type: "string", enum: ["GET"] } }, required: ["type", "method"] } }, required: ["input"] },
    ...(routeTemplate === undefined ? {} : { routeTemplate }),
  } } };
}

describe("Bazaar trust boundary", () => {
  it("accepts a conformant Stellar HTTP listing", () => expect(() => validateCatalogPayload(payload("/weather/:city"), requirements)).not.toThrow());
  it.each(["/weather/../admin", "/weather/%2e%2e/admin", "https://evil.example/:id", "/safe/%3A%2F%2Fevil"])("rejects hostile routeTemplate %s", value => expect(() => validateCatalogPayload(payload(value), requirements)).toThrow("routeTemplate"));
  it("rejects terms tampering", () => {
    const tampered = payload(); tampered.accepted = { ...requirements, amount: "1" };
    expect(() => validateCatalogPayload(tampered, requirements)).toThrow("accepted.amount");
  });
  it("rejects external schema references", () => {
    const value = payload(); (value.extensions!.bazaar as any).schema.$ref = "https://evil.example/schema.json";
    expect(() => validateCatalogPayload(value, requirements)).toThrow("schema");
  });
});
