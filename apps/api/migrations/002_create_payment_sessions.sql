CREATE TABLE IF NOT EXISTS payment_sessions (
  id UUID PRIMARY KEY,

  automation_id UUID NOT NULL
    REFERENCES automations(id)
    ON DELETE CASCADE,

  payer_address TEXT NOT NULL,

  network TEXT NOT NULL
    CHECK (network IN ('TESTNET', 'PUBLIC')),

  asset_contract TEXT NOT NULL,

  treasury_address TEXT NOT NULL,

  amount NUMERIC(78, 0) NOT NULL
    CHECK (amount >= 0),

  args_xdr JSONB NOT NULL,

  expires_at_ledger BIGINT NOT NULL
    CHECK (expires_at_ledger >= 0),

  quote_expires_at TIMESTAMPTZ NOT NULL,

  status TEXT NOT NULL DEFAULT 'PREPARED'
    CHECK (
      status IN (
        'PREPARED',
        'SETTLING',
        'SUBMITTED',
        'SETTLED',
        'FAILED',
        'EXPIRED'
      )
    ),

  signed_auth_hash TEXT,

  transaction_hash TEXT,

  error TEXT,

  settled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_sessions_automation_id_idx
  ON payment_sessions (automation_id);

CREATE INDEX IF NOT EXISTS payment_sessions_status_idx
  ON payment_sessions (status);

CREATE INDEX IF NOT EXISTS payment_sessions_payer_address_idx
  ON payment_sessions (payer_address);

CREATE INDEX IF NOT EXISTS payment_sessions_quote_expires_at_idx
  ON payment_sessions (quote_expires_at);

CREATE INDEX IF NOT EXISTS payment_sessions_created_at_idx
  ON payment_sessions (created_at DESC);

ALTER TABLE automations
  ADD CONSTRAINT automations_payment_session_id_fkey
  FOREIGN KEY (payment_session_id)
  REFERENCES payment_sessions(id)
  ON DELETE SET NULL;