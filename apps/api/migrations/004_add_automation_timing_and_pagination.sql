ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_finished_at TIMESTAMPTZ;

-- last_run_at, created_at, updated_at, activated_at and revoked_at already exist
-- in the current schema used by repository.ts. These guards make the migration
-- safe for older development databases as well.
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS automations_wallet_network_created_id_idx
  ON automations (wallet_address, network, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS automations_wallet_created_id_idx
  ON automations (wallet_address, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS automations_next_run_active_idx
  ON automations (next_run_at)
  WHERE status = 'ACTIVE' AND next_run_at IS NOT NULL;
