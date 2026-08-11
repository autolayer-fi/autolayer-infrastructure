CREATE TABLE IF NOT EXISTS gateway_quota_counters (
  wrapper_id UUID NOT NULL REFERENCES gateway_wrappers(id) ON DELETE CASCADE,
  period_kind TEXT NOT NULL CHECK (period_kind IN ('minute','month')),
  period_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(wrapper_id, period_kind, period_start)
);

CREATE INDEX IF NOT EXISTS gateway_quota_counters_period_idx
  ON gateway_quota_counters(period_start);
