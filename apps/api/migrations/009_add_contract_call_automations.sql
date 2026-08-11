ALTER TABLE automations
  DROP CONSTRAINT IF EXISTS automations_type_check;

ALTER TABLE automations
  ADD CONSTRAINT automations_type_check
  CHECK (type IN ('CONTRACT_CALL', 'DCA', 'REBALANCE', 'DISBURSEMENT'));
