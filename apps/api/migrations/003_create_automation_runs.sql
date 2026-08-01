CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY,

  automation_id UUID NOT NULL
    REFERENCES automations(id)
    ON DELETE CASCADE,

  idempotency_key TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL DEFAULT 'STARTED'
    CHECK (
      status IN (
        'STARTED',
        'SUCCEEDED',
        'FAILED'
      )
    ),

  scheduled_for TIMESTAMPTZ NOT NULL,

  transaction_hash TEXT,

  response_json JSONB,

  error TEXT,

  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_runs_automation_id_idx
  ON automation_runs (automation_id);

CREATE INDEX IF NOT EXISTS automation_runs_status_idx
  ON automation_runs (status);

CREATE INDEX IF NOT EXISTS automation_runs_scheduled_for_idx
  ON automation_runs (scheduled_for DESC);

CREATE INDEX IF NOT EXISTS automation_runs_created_at_idx
  ON automation_runs (created_at DESC);