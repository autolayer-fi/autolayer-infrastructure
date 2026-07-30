# AutoLayer API

Production-oriented Express API for automation proposals, encrypted delegate keys, Agenda scheduling, and self-hosted exact Soroban payments.

## Run locally

```bash
cp apps/api/.env.example apps/api/.env
# Fill both distinct secrets, treasury, asset, and encryption key.
docker compose up -d postgres
pnpm migrate
pnpm build
pnpm --filter @autolayer/api dev
```

The local API defaults to `http://localhost:5001` and PostgreSQL is mapped to `localhost:5434`.

## Payment accounts

- `AUTOMATION_PAYMASTER_SECRET` signs scheduled automation transaction envelopes.
- `PAYMENT_RELAYER_SECRET` signs and submits exact-payment envelopes.
- `TREASURY_G_ACCOUNT` receives the token payment.

These must be separate operational roles. The two secret keys are rejected if equal.

## Payment endpoints

```text
POST /v1/automations/:id/payment/prepare
POST /v1/automations/:id/payment/settle
```

Prepare accepts `{ payerAddress }` where the payer can be a `G...` or `C...` address. It returns the canonical SEP-41 `transfer` call and unsigned auth entry. The client signs the auth entry, then settle validates and submits it with the payment relayer.

See `../../SELF_HOSTED_PAYMENT_FACILITATOR.md` and `../../examples/socketfi-payment-flow.jsx`.
