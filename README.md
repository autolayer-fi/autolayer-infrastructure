# AutoLayer Monorepo

Production-oriented AutoLayer API and TypeScript SDK.

## Workspaces

- `apps/api`: private Express application. Deploy it as a service; do not publish it to npm.
- `packages/sdk`: public `@autolayer/sdk` package.
- `packages/shared`: private shared DTOs, domain types, and API contracts.
- `packages/crypto`: private encryption, Ed25519 PoP, policy ID, and Soroban XDR helpers.

## Requirements

- Node.js 20+
- pnpm 10.34.5+
- Docker, for local PostgreSQL

## Install

```bash
pnpm install
```

pnpm discovers the workspaces through `pnpm-workspace.yaml`.

## Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Generate the 32-byte key-encryption master key:

```bash
openssl rand -base64 32
```

Set `KEY_ENCRYPTION_MASTER_KEY` in `apps/api/.env` and configure the Treasury, Paymaster, x402 facilitator, Stellar RPC.

The local AutoLayer API defaults to `http://localhost:5001`.

## Start PostgreSQL

```bash
docker compose up -d postgres
```

When running the API directly on the host, use:

```env
DATABASE_URL=postgresql://autolayer:autolayer@localhost:5434/autolayer
```

## Migrate and run

```bash
pnpm migrate
pnpm dev
```

Health check:

```bash
curl http://localhost:5001/health
```

## Build

Build all workspaces:

```bash
pnpm build
```

Build only the SDK:

```bash
pnpm build:sdk
```

Build only the API:

```bash
pnpm build:api
```

Run tests:

```bash
pnpm test
```

Run the compiled API:

```bash
pnpm start
```

## SDK usage

```ts
import { AutoLayer } from "@autolayer/sdk";

AutoLayer.configure({
  environment: "DEVELOPMENT",
});

const proposal = await AutoLayer.propose({
  network: "TESTNET",
  type: "DCA",
  walletAddress: "C...",
  validAfterLedger: 1,
  expiresAtLedger: 100_000,
  schedule: {
    kind: "INTERVAL",
    expression: "10 hours",
  },
  strategy: {
    protocol: {
      name: "Aqua",
      contractId: "C...",
      functionName: "swap",
    },
    inputAsset: "C...",
    outputAsset: "C...",
    amountPerRun: "100000000",
    maxTotalAmount: "3000000000",
    spendRecipients: ["C..."],
  },
});
```

`environment` selects the AutoLayer API deployment:

- `DEVELOPMENT` → `http://localhost:5001`
- `PRODUCTION` → `https://api.autolayer.io`

`network` remains required in proposals and selects the Stellar network. It never selects the API URL.

For staging, LAN, or private deployments:

```ts
AutoLayer.configure({
  apiUrl: "http://192.168.1.20:5001",
});
```

## Package the SDK locally

```bash
pnpm build:sdk
pnpm --filter @autolayer/sdk pack
```

## Disbursement automation

AutoLayer supports `DCA`, `REBALANCE`, and `DISBURSEMENT` proposals. A disbursement proposal uses one token contract and an array of recipients and integer base-unit amounts. Repeating disbursements require `maxUses`; one-time disbursements require `maxUses: 1`.

```ts
const proposal = await AutoLayer.propose({
  type: "DISBURSEMENT",
  network: "TESTNET",
  walletAddress: "C...",
  validAfterLedger: 100,
  expiresAtLedger: 10000,
  maxUses: 5,
  schedule: { kind: "INTERVAL", expression: "10 minutes" },
  strategy: {
    asset: "C...",
    repeat: true,
    recipients: [
      { address: "G...", amount: "10000000" },
      { address: "C...", amount: "20000000" },
    ],
  },
});
```

The generated session policy has an empty protocol-permission array and an asset spend limit containing the approved recipients. The connected smart account must support transfer-only delegated policies.

## Self-hosted exact payment facilitator

This repository now includes a built-in Soroban exact-payment facilitator. It does not depend on a hosted facilitator or OpenZeppelin Relayer.

Use separate funded accounts for `AUTOMATION_PAYMASTER_SECRET` and `PAYMENT_RELAYER_SECRET`. Run migration `003_self_hosted_payment_facilitator.sql`, then use:

1. `AutoLayer.preparePayment(proposal, { payerAddress })`
2. Sign the returned canonical token transfer client-side.
3. `AutoLayer.settlePayment(proposal, { paymentSessionId, signedAuthEntriesXdr })`
4. `AutoLayer.activate(...)`

See `SELF_HOSTED_PAYMENT_FACILITATOR.md` and `examples/App-full-strategy-tester.jsx`.
