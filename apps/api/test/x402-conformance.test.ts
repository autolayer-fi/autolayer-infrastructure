import { describe, expect, it } from "vitest";
import type { Request } from "express";
import type { PaymentRequirements } from "@x402/core/types";
import { encodeCatalogOutcome } from "../src/services/bazaar.js";
import { facilitator, parseFacilitatorBody } from "../src/services/x402-facilitator.js";

describe("x402 v2 wire conformance", () => {
  it("advertises exact on both Stellar networks with sponsored fees", () => {
    const supported = facilitator.getSupported();
    for (const network of ["stellar:testnet", "stellar:pubnet"]) {
      const kind = supported.kinds.find(value => value.network === network && value.scheme === "exact");
      expect(kind).toMatchObject({ x402Version: 2, extra: { areFeesSponsored: true } });
    }
  });

  it("accepts canonical payload.transaction without rewriting it", () => {
    const body = { paymentPayload: { x402Version: 2, accepted: {}, payload: { transaction: "AAAA-canonical-xdr" } }, paymentRequirements: { scheme: "exact" } };
    const parsed = parseFacilitatorBody(body);
    expect(parsed.paymentPayload.payload.transaction).toBe("AAAA-canonical-xdr");
  });

  it("encodes the exact Bazaar response header shape", () => {
    const success = JSON.parse(Buffer.from(encodeCatalogOutcome({ success: true, resource: "https://seller.example" }), "base64").toString());
    const rejected = JSON.parse(Buffer.from(encodeCatalogOutcome({ success: false, reason: "bad schema" }), "base64").toString());
    expect(success).toEqual({ bazaar: { status: "success" } });
    expect(rejected).toEqual({ bazaar: { status: "rejected", rejectedReason: "bad schema" } });
  });

  it("documents a non-null reason on malformed request parsing", () => {
    expect(() => parseFacilitatorBody({})).toThrow("paymentPayload and paymentRequirements are required");
  });
});
