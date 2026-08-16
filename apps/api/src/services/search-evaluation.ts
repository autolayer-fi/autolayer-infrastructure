export interface JudgedQuery { query: string; relevant: Record<string, number> }

export function reciprocalRank(results: string[], relevant: Record<string, number>): number {
  const index = results.findIndex(value => (relevant[value] ?? 0) > 0);
  return index < 0 ? 0 : 1 / (index + 1);
}

export function dcg(results: string[], relevant: Record<string, number>, k = 10): number {
  return results.slice(0, k).reduce((sum, value, index) => sum + ((2 ** (relevant[value] ?? 0)) - 1) / Math.log2(index + 2), 0);
}

export function ndcg(results: string[], relevant: Record<string, number>, k = 10): number {
  const ideal = Object.entries(relevant).sort((a, b) => b[1] - a[1]).map(([value]) => value);
  const denominator = dcg(ideal, relevant, k);
  return denominator === 0 ? 0 : dcg(results, relevant, k) / denominator;
}

export function recallAt(results: string[], relevant: Record<string, number>, k = 10): number {
  const expected = Object.values(relevant).filter(value => value > 0).length;
  if (!expected) return 0;
  return results.slice(0, k).filter(value => (relevant[value] ?? 0) > 0).length / expected;
}
