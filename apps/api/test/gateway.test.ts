import { describe, expect, it } from "vitest";
import {
  assertSafeUpstream,
  slugifyWrapperName,
  wrapperInput,
} from "../src/services/gateway.js";

describe("xWrapper security boundary", () => {
  it.each([
    ["Realtime Market Data", "realtime-market-data"],
    ["  Billing / POS Service!  ", "billing-pos-service"],
    ["x", "x-api"],
  ])("generates a safe slug from %s", (name, expected) =>
    expect(slugifyWrapperName(name)).toBe(expected),
  );
  it.each([
    "http://example.com",
    "https://127.0.0.1/admin",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.1/internal",
    "https://[::1]/admin",
  ])("rejects unsafe upstream %s", async (upstream) => {
    await expect(assertSafeUpstream(upstream)).rejects.toThrow();
  });

  it("requires a vault reference for credential injection", () => {
    const result = wrapperInput.safeParse({
      slug: "paid-data",
      name: "Paid data",
      upstreamUrl: "https://example.com/data",
      network: "stellar:testnet",
      asset: `C${"A".repeat(55)}`,
      amount: "10000",
      payTo: `G${"A".repeat(55)}`,
      authType: "bearer",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a bounded unauthenticated wrapper configuration", () => {
    const result = wrapperInput.safeParse({
      slug: "paid-data",
      name: "Paid data",
      upstreamUrl: "https://example.com/data",
      network: "stellar:testnet",
      asset: `C${"A".repeat(55)}`,
      amount: "10000",
      payTo: `G${"A".repeat(55)}`,
      authType: "none",
    });
    expect(result.success).toBe(true);
  });
});
