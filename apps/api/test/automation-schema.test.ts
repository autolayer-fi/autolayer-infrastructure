import { describe, expect, it } from "vitest";

import { proposalSchema } from "../src/api/schemas.js";

const contract = `C${"A".repeat(55)}`;

describe("contract-call automation proposals", () => {
  it("accepts a typed Soroban invocation", () => {
    const result = proposalSchema.parse({
      type: "CONTRACT_CALL",
      network: "TESTNET",
      walletAddress: contract,
      validAfterLedger: 100,
      expiresAtLedger: 200,
      maxUses: 5,
      schedule: { kind: "CRON", expression: "0 * * * *", timezone: "UTC" },
      strategy: {
        contractId: contract,
        functionName: "autolayer_run",
        args: [
          { type: "address", value: contract },
          { type: "u128", value: "10000000" },
          { type: "bool", value: true },
        ],
      },
    });

    expect(result.type).toBe("CONTRACT_CALL");
  });

  it("rejects unsafe function names and untyped arguments", () => {
    expect(() =>
      proposalSchema.parse({
        type: "CONTRACT_CALL",
        network: "TESTNET",
        walletAddress: contract,
        validAfterLedger: 100,
        expiresAtLedger: 200,
        maxUses: 1,
        schedule: { kind: "CRON", expression: "0 * * * *" },
        strategy: {
          contractId: contract,
          functionName: "../upgrade",
          args: [{ value: "unchecked" }],
        },
      }),
    ).toThrow();
  });
});
