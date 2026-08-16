import { readFile } from "node:fs/promises";

const baseUrl = (process.argv[2] || "http://localhost:5001").replace(/\/$/, "");
const corpus = JSON.parse(await readFile(new URL("../apps/api/test/fixtures/search-quality.json", import.meta.url), "utf8"));
const scores = [];
for (const judged of corpus) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/discovery/search?query=${encodeURIComponent(judged.query)}&limit=10`);
  const latencyMs = performance.now() - started;
  if (!response.ok) throw new Error(`Search failed (${response.status}) for ${judged.query}`);
  const body = await response.json();
  const ids = body.resources.map(value => value.resourceKey || value.resource);
  const rank = ids.findIndex(id => (judged.relevant[id] || 0) > 0);
  const relevant = Object.values(judged.relevant).filter(value => value > 0).length;
  const gains = ids.slice(0, 10).map(id => judged.relevant[id] || 0);
  const dcg = gains.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
  const ideal = Object.values(judged.relevant).sort((a, b) => b - a).slice(0, 10);
  const idcg = ideal.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
  scores.push({
    query: judged.query,
    reciprocalRank: rank < 0 ? 0 : 1 / (rank + 1),
    recall10: ids.slice(0, 10).filter(id => (judged.relevant[id] || 0) > 0).length / relevant,
    ndcg10: idcg === 0 ? 0 : dcg / idcg,
    latencyMs,
  });
}
const mean = key => scores.reduce((sum, value) => sum + value[key], 0) / scores.length;
const percentile = (values, probability) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * probability) - 1)];
};
const latencies = scores.map(value => value.latencyMs);
console.log(JSON.stringify({
  queries: scores.length,
  ndcgAt10: mean("ndcg10"),
  mrr: mean("reciprocalRank"),
  recallAt10: mean("recall10"),
  latencyMs: { mean: mean("latencyMs"), p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
  evaluatedAt: new Date().toISOString(),
  perQuery: scores,
}, null, 2));
