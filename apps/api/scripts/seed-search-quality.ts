import { readFile } from "node:fs/promises";
import { pool } from "../src/db/pool.js";

const fixtures = JSON.parse(
  await readFile(new URL("../test/fixtures/search-resources.json", import.meta.url), "utf8"),
) as Array<{ resource: string; type: "http" | "mcp"; toolName?: string; serviceName: string; description: string; tags: string[] }>;

const accepts = [{
  scheme: "exact",
  network: "stellar:testnet",
  asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  amount: "10000",
  payTo: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  maxTimeoutSeconds: 60,
  extra: { areFeesSponsored: true },
}];

for (const fixture of fixtures) {
  const key = fixture.type === "mcp" ? `${fixture.resource}#${fixture.toolName}` : fixture.resource;
  await pool.query(
    `INSERT INTO bazaar_resources
      (resource_key, resource_url, resource_type, tool_name, x402_version, description, mime_type, service_name, tags, accepts, extensions, discovery_info)
     VALUES ($1,$2,$3,$4,2,$5,'application/json',$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)
     ON CONFLICT (resource_key) DO UPDATE SET description=EXCLUDED.description, service_name=EXCLUDED.service_name,
       tags=EXCLUDED.tags, accepts=EXCLUDED.accepts, extensions=EXCLUDED.extensions,
       discovery_info=EXCLUDED.discovery_info, last_updated=NOW()`,
    [key, fixture.resource, fixture.type, fixture.toolName ?? null, fixture.description, fixture.serviceName,
      fixture.tags, JSON.stringify(accepts), JSON.stringify({ bazaar: {} }),
      JSON.stringify({ input: fixture.type === "mcp" ? { type: "mcp", toolName: fixture.toolName } : { type: "http" }, inputSchema: { properties: {}, required: [] } })],
  );
}

console.log(`Seeded ${fixtures.length} judged Bazaar search resources.`);
await pool.end();
