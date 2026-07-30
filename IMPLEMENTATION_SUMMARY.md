# Self-hosted facilitator implementation summary

## Added

- Separate `AUTOMATION_PAYMASTER_SECRET` and `PAYMENT_RELAYER_SECRET`.
- Canonical payment prepare endpoint.
- Exact signed-auth-entry verification for G or C account payers.
- Payment settlement through the dedicated relayer.
- Confirmation polling and recoverable `SUBMITTED` payment state.
- PostgreSQL replay constraints, payment-session state machine, row locking, and idempotency.
- PostgreSQL advisory locks for both Stellar source accounts across multiple API replicas.
- SDK `preparePayment` and `settlePayment` methods.
- Full SocketFi passkey payment example.
- Updated strategy tester using one-click SocketFi payment instead of pasted payloads.

## Required wallet behavior

SocketFi signs the prepared SEP-41 token transfer using its normal `signTx` flow. The server does not perform passkey verification itself; Stellar invokes the smart account's `__check_auth` during simulation and settlement.
