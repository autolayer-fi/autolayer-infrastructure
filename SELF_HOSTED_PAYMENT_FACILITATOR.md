# AutoLayer self-hosted payment facilitator

AutoLayer now implements its own exact Soroban payment facilitator. No hosted facilitator or OpenZeppelin Relayer is required.

## Accounts

Use two separate funded classic accounts:

- `AUTOMATION_PAYMASTER_SECRET`: submits scheduled automation envelopes.
- `PAYMENT_RELAYER_SECRET`: submits exact payment transfers and pays their fees.

The treasury is a third address: `TREASURY_G_ACCOUNT`.

## Payment protocol

1. `POST /v1/automations/:id/payment/prepare` with `{ "payerAddress": "G... or C..." }`.
2. AutoLayer stores a short-lived payment session and returns the canonical token `transfer` call, its args XDR, and unsigned auth entry.
3. The payer signs the exact authorization entry client-side.
4. `POST /v1/automations/:id/payment/settle` with the payment session ID and one signed auth entry.
5. AutoLayer locks the payment session, decodes and verifies the entry, rejects sub-invocations, checks payer/asset/treasury/amount/expiry, simulates, assembles, signs with the payment relayer, submits, confirms, and atomically marks the automation paid.

## Payer support

The server treats the payer as a generic Stellar address. A classic account signs with Ed25519. A contract account such as SocketFi signs with its custom account credential; Stellar invokes `__check_auth` during simulation/submission.

## Security

- Canonical payment call constructed by AutoLayer.
- Exact asset, payer, treasury, and integer amount validation.
- One address-credential auth entry and no sub-invocations.
- Short ledger expiry and quote expiry.
- Unique signed-auth hash and transaction hash.
- PostgreSQL row lock and idempotent settlement.
- Separate relayer and automation paymaster secrets.
