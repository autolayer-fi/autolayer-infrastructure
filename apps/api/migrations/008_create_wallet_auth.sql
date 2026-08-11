CREATE TABLE IF NOT EXISTS console_users (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE CHECK (wallet_address ~ '^G[A-Z2-7]{55}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL CHECK (wallet_address ~ '^G[A-Z2-7]{55}$'),
  network TEXT NOT NULL CHECK (network IN ('TESTNET','PUBLIC')),
  transaction_hash TEXT NOT NULL UNIQUE,
  transaction_xdr TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_challenges_expiry_idx ON auth_challenges(expires_at);

CREATE TABLE IF NOT EXISTS console_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES console_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS console_sessions_user_idx ON console_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES console_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS user_api_keys_user_idx ON user_api_keys(user_id, created_at DESC);
