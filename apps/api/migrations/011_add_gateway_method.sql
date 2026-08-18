ALTER TABLE gateway_wrappers
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'GET';

ALTER TABLE gateway_wrappers
  DROP CONSTRAINT IF EXISTS gateway_wrappers_method_check;

ALTER TABLE gateway_wrappers
  ADD CONSTRAINT gateway_wrappers_method_check
  CHECK (method IN ('GET','POST','PUT','PATCH','DELETE'));
