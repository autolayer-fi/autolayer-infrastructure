import { beforeEach, describe, expect, it, vi } from "vitest";
import { listResources } from "../src/services/bazaar.js";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

import { pool } from "../src/db/pool.js";

describe("Bazaar listing filters", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("supports type/payTo/scheme/network/extension and pagination filters", async () => {
    const [mockPayTo] = [`G${"A".repeat(55)}`];
    const query = vi
      .mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    await listResources({
      type: "http",
      payTo: mockPayTo,
      scheme: "exact",
      network: "stellar:testnet",
      extensions: "bazaar,agent",
      limit: 10,
      offset: 40,
    });

    const listWhereCall = query.mock.calls[0];
    const listRowsCall = query.mock.calls[1];
    expect(listWhereCall?.[0]).toContain("resource_type = $1");
    expect(listWhereCall?.[0]).toContain("accepts @> $2::jsonb");
    expect(listWhereCall?.[0]).toContain("accepts @> $3::jsonb");
    expect(listWhereCall?.[0]).toContain("accepts @> $4::jsonb");
    expect(listWhereCall?.[0]).toContain("jsonb_exists(extensions, $5)");
    expect(listWhereCall?.[0]).toContain("jsonb_exists(extensions, $6)");
    expect(listWhereCall?.[1]).toEqual([
      "http",
      JSON.stringify([{ payTo: mockPayTo }]),
      JSON.stringify([{ scheme: "exact" }]),
      JSON.stringify([{ network: "stellar:testnet" }]),
      "bazaar",
      "agent",
    ]);
    expect(listRowsCall?.[0]).toContain("resource_type = $1");
    expect(listRowsCall?.[1]).toEqual([
      ...listWhereCall?.[1],
      10,
      40,
    ]);
    expect(listRowsCall?.[0]).toContain("LIMIT $7 OFFSET $8");
  });

  it("handles repeated extensions and whitespace safely", async () => {
    const query = vi
      .mocked(pool.query)
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    await listResources({
      type: undefined,
      payTo: undefined,
      scheme: undefined,
      network: undefined,
      extensions: " bazaar , discovery ,agent ",
      limit: 15,
      offset: 0,
    });

    expect(query.mock.calls[0]?.[1]).toEqual(["bazaar", "discovery", "agent"]);
    expect(query.mock.calls[1]?.[1]).toEqual(["bazaar", "discovery", "agent", 15, 0]);
  });
});
