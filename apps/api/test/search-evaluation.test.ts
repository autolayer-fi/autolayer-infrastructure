import { describe, expect, it } from "vitest";
import { ndcg, recallAt, reciprocalRank } from "../src/services/search-evaluation.js";

describe("Bazaar search quality metrics", () => {
  const relevance = { weather: 3, climate: 2, unrelated: 0 };
  it("scores perfect ranking as one", () => expect(ndcg(["weather", "climate"], relevance)).toBe(1));
  it("penalizes worse ranking", () => expect(ndcg(["climate", "weather"], relevance)).toBeLessThan(1));
  it("reports reciprocal rank and recall", () => {
    expect(reciprocalRank(["unrelated", "weather"], relevance)).toBe(0.5);
    expect(recallAt(["weather"], relevance)).toBe(0.5);
  });
});
