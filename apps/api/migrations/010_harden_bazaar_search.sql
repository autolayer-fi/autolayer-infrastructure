ALTER TABLE bazaar_resources ADD COLUMN IF NOT EXISTS settlement_count BIGINT NOT NULL DEFAULT 1;
ALTER TABLE bazaar_resources ADD COLUMN IF NOT EXISTS first_cataloged TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP INDEX IF EXISTS bazaar_resources_search_idx;
ALTER TABLE bazaar_resources DROP COLUMN IF EXISTS search_vector;
ALTER TABLE bazaar_resources ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(service_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(tool_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(tags[1], '') || ' ' || coalesce(tags[2], '') || ' ' || coalesce(tags[3], '') || ' ' || coalesce(tags[4], '') || ' ' || coalesce(tags[5], '')), 'B') ||
  setweight(to_tsvector('simple', resource_url), 'C')
) STORED;
CREATE INDEX bazaar_resources_search_idx ON bazaar_resources USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS bazaar_resources_payto_idx ON bazaar_resources USING GIN(accepts);
