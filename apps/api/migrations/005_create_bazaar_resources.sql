CREATE TABLE IF NOT EXISTS bazaar_resources (
  resource_key TEXT PRIMARY KEY,
  resource_url TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('http', 'mcp')),
  tool_name TEXT,
  x402_version INTEGER NOT NULL,
  description TEXT,
  mime_type TEXT,
  service_name TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  accepts JSONB NOT NULL,
  extensions JSONB NOT NULL DEFAULT '{}',
  discovery_info JSONB NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(service_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', resource_url), 'C') ||
    setweight(to_tsvector('english', coalesce(tool_name, '')), 'A')
  ) STORED
);

CREATE INDEX IF NOT EXISTS bazaar_resources_search_idx ON bazaar_resources USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS bazaar_resources_filters_idx ON bazaar_resources(resource_type, last_updated DESC);
