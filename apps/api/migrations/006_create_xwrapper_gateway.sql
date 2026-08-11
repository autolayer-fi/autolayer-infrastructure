CREATE TABLE IF NOT EXISTS gateway_secrets (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  encrypted_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, name)
);

CREATE TABLE IF NOT EXISTS gateway_wrappers (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  name TEXT NOT NULL,
  description TEXT,
  upstream_url TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('stellar:testnet','stellar:pubnet')),
  scheme TEXT NOT NULL DEFAULT 'exact' CHECK (scheme IN ('exact')),
  asset TEXT NOT NULL CHECK (asset ~ '^C[A-Z2-7]{55}$'),
  amount TEXT NOT NULL CHECK (amount ~ '^[1-9][0-9]*$'),
  pay_to TEXT NOT NULL CHECK (pay_to ~ '^[GC][A-Z2-7]{55}$'),
  mime_type TEXT NOT NULL DEFAULT 'application/json',
  tags TEXT[] NOT NULL DEFAULT '{}',
  secret_id UUID REFERENCES gateway_secrets(id) ON DELETE RESTRICT,
  auth_type TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none','header','bearer')),
  auth_header TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  requests_per_minute INTEGER NOT NULL DEFAULT 60 CHECK (requests_per_minute BETWEEN 1 AND 10000),
  monthly_request_quota INTEGER NOT NULL DEFAULT 100000 CHECK (monthly_request_quota BETWEEN 1 AND 100000000),
  max_request_bytes INTEGER NOT NULL DEFAULT 1048576 CHECK (max_request_bytes BETWEEN 0 AND 10485760),
  max_response_bytes INTEGER NOT NULL DEFAULT 5242880 CHECK (max_response_bytes BETWEEN 1024 AND 52428800),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gateway_wrappers_owner_idx ON gateway_wrappers(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gateway_requests (
  id UUID PRIMARY KEY,
  wrapper_id UUID NOT NULL REFERENCES gateway_wrappers(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('CHALLENGED','RATE_LIMITED','QUOTA_EXCEEDED','VERIFY_FAILED','SETTLE_FAILED','UPSTREAM_SUCCESS','UPSTREAM_ERROR','GATEWAY_ERROR')),
  duration_ms INTEGER,
  request_bytes INTEGER NOT NULL DEFAULT 0,
  response_bytes INTEGER NOT NULL DEFAULT 0,
  client_ip_hash TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gateway_requests_wrapper_time_idx ON gateway_requests(wrapper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_requests_owner_time_idx ON gateway_requests(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gateway_payments (
  id UUID PRIMARY KEY,
  wrapper_id UUID NOT NULL REFERENCES gateway_wrappers(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  network TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount TEXT NOT NULL,
  pay_to TEXT NOT NULL,
  payer TEXT,
  transaction_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('SETTLED','FAILED')),
  facilitator_response JSONB NOT NULL,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gateway_payments_wrapper_time_idx ON gateway_payments(wrapper_id, settled_at DESC);
