CREATE TABLE IF NOT EXISTS automations (
  id UUID PRIMARY KEY,

  wallet_address TEXT NOT NULL,

  network TEXT NOT NULL
    CHECK (network IN ('TESTNET', 'PUBLIC')),

  type TEXT NOT NULL
    CHECK (type IN ('DCA', 'REBALANCE', 'DISBURSEMENT')),

  status TEXT NOT NULL DEFAULT 'PROPOSED'
    CHECK (
      status IN (
        'PROPOSED',
        'PAID',
        'ACTIVE',
        'PAUSED',
        'REVOKED',
        'FAILED',
        'EXPIRED'
      )
    ),

  expected_policy_id_hex TEXT NOT NULL,

  onchain_policy_id_hex TEXT,

  session_creation_tx_hash TEXT,

  delegate_public_key_ciphertext TEXT NOT NULL,

  delegate_public_key_iv TEXT NOT NULL,

  delegate_public_key_tag TEXT NOT NULL,

  delegate_private_key_ciphertext TEXT NOT NULL,

  delegate_private_key_iv TEXT NOT NULL,

  delegate_private_key_tag TEXT NOT NULL,

  encryption_version INTEGER NOT NULL,

  policy_input_json JSONB NOT NULL,

  policy_input_xdr_base64 TEXT NOT NULL,

  delegate_pop_hex TEXT NOT NULL,

  delegate_pop_xdr_base64 TEXT NOT NULL,

  strategy_json JSONB NOT NULL,

  schedule_json JSONB NOT NULL,

  valid_after_ledger BIGINT NOT NULL
    CHECK (valid_after_ledger >= 0),

  expires_at_ledger BIGINT NOT NULL
    CHECK (expires_at_ledger >= 0),

  max_uses INTEGER
    CHECK (max_uses IS NULL OR max_uses > 0),

  run_count INTEGER NOT NULL DEFAULT 0
    CHECK (run_count >= 0),

  spent_amount NUMERIC(78, 0) NOT NULL DEFAULT 0
    CHECK (spent_amount >= 0),

  agenda_job_id TEXT,

  payment_status TEXT NOT NULL DEFAULT 'REQUIRED'
    CHECK (
      payment_status IN (
        'REQUIRED',
        'PAID',
        'FAILED',
        'EXPIRED'
      )
    ),

  payment_amount NUMERIC(78, 0) NOT NULL
    CHECK (payment_amount >= 0),

  payment_asset TEXT NOT NULL,

  payment_network TEXT NOT NULL
    CHECK (payment_network IN ('TESTNET', 'PUBLIC')),

  payment_treasury TEXT NOT NULL,

  payment_quote_expires_at TIMESTAMPTZ NOT NULL,

  payment_session_id UUID,

  payment_payload_hash TEXT,

  payment_tx_hash TEXT,

  payment_payer TEXT,

  activated_at TIMESTAMPTZ,

  revoked_at TIMESTAMPTZ,

  last_run_at TIMESTAMPTZ,

  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (expires_at_ledger > valid_after_ledger)
);

CREATE INDEX IF NOT EXISTS automations_wallet_address_idx
  ON automations (wallet_address);

CREATE INDEX IF NOT EXISTS automations_wallet_network_idx
  ON automations (wallet_address, network);

CREATE INDEX IF NOT EXISTS automations_status_idx
  ON automations (status);

CREATE INDEX IF NOT EXISTS automations_payment_status_idx
  ON automations (payment_status);

CREATE INDEX IF NOT EXISTS automations_type_idx
  ON automations (type);

CREATE INDEX IF NOT EXISTS automations_agenda_job_id_idx
  ON automations (agenda_job_id);

CREATE INDEX IF NOT EXISTS automations_created_at_idx
  ON automations (created_at DESC);