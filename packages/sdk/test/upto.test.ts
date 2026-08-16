import { describe, expect, it } from "vitest";
import { validateUptoSettlement } from "../src/upto.js";

const authorization = { network: "stellar:testnet" as const, settlementContract: `C${"A".repeat(55)}`, payer: `G${"B".repeat(55)}`, asset: `C${"C".repeat(55)}`, payTo: `G${"D".repeat(55)}`, maximumAmount: "5000000", nonce: "ab".repeat(32), expirationLedger: 1000, facilitator: `G${"E".repeat(55)}` };

describe("Stellar upto invariants", () => {
  it("accepts a partial charge", () => expect(() => validateUptoSettlement(authorization, "1250000", 900)).not.toThrow());
  it("rejects an over-cap charge", () => expect(() => validateUptoSettlement(authorization, "5000001", 900)).toThrow("OUT_OF_RANGE"));
  it("rejects expired authorization", () => expect(() => validateUptoSettlement(authorization, "1", 1001)).toThrow("EXPIRED"));
});
