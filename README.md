# AutoLayer

AutoLayer is open-source execution, payment, discovery, and automation infrastructure for Stellar applications and agents. It combines a wallet-authorized automation runtime, an x402 v2 facilitator, Bazaar discovery, the xWrapper paid API gateway, encrypted xVault2 credential injection, fee sponsorship, an MCP server, and agent-readable financial skills.

> AutoLayer is an independent product and has no architectural or product dependency on Atonima.

## What is implemented

| Capability | Implementation |
| --- | --- |
| Public website and playground | React, TypeScript, Tailwind and Vite |
| Wallet console | Stellar Wallets Kit with Classic transaction and Soroban auth-entry signing |
| Wallet authentication | Five-minute signed challenges, hashed 24-hour sessions and owner scoping |
| Personal API keys | Named `al_live_` keys with one-time display, rotation, revocation and hashed storage |
| Automation runtime | Generic Soroban contract calls, DCA, rebalance and disbursement proposals |
| Scheduler | Agenda with PostgreSQL persistence, lifecycle controls and run history |
| Fee sponsorship | Separate automation paymaster and payment relayer accounts |
| x402 facilitator | Upstream `@x402/stellar` exact scheme on `stellar:testnet` and `stellar:pubnet` |
| Bazaar | Automatic post-settlement cataloging, list filters and ranked PostgreSQL search |
| xWrapper | Persistent multi-tenant HTTPS-to-x402 gateway with quotas, logs and analytics |
| xVault2 | AES-256-GCM encrypted upstream secrets with scoped gateway injection |
| Agent interfaces | MCP discovery/paid-call tools and versioned financial skill specifications |

The implementation-status table in [`docs/architecture/production-architecture.mdx`](docs/architecture/production-architecture.mdx) is the source of truth for launch gates. “Implemented” does not imply that third-party review or published mainnet conformance evidence has been completed.

## Repository

```text
autolayer-core/
├── apps/
│   ├── api/                  Express API, scheduler, x402, Bazaar, MCP and gateway
│   └── web/                  Website, playground and wallet-enabled console
├── packages/
│   └── sdk/                  Typed @autolayer/sdk client
├── examples/
│   └── autolayer-keeper/     Soroban automation interface example
├── docs/                     Mintlify documentation source
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## Requirements

- Node.js 22 or later
- pnpm 10.34.5 or later
- Docker with Compose for local PostgreSQL
- A Stellar wallet supported by Stellar Wallets Kit
- SEP-43 auth-entry signing for x402 settlement and smart-account sessions

## Run locally

From `autolayer-core`:

```bash
pnpm install
pnpm setup:dev
docker compose up -d postgres
pnpm migrate
pnpm dev
```

Open:

- Website: `http://localhost:5173`
- Playground: `http://localhost:5173/playground`
- Console: `http://localhost:5173/console`
- API: `http://localhost:5001`
- Facilitator support: `http://localhost:5001/supported`
- Bazaar: `http://localhost:5001/discovery/resources`
- Agent Skills: `http://localhost:5001/v1/skills`

`pnpm setup:dev` creates an untracked `apps/api/.env` with random, unfunded development identities and does not overwrite an existing file. The generated configuration is intended for `EXECUTION_MODE=mock`.

### Manual configuration

```bash
cp apps/api/.env.example apps/api/.env
openssl rand -base64 32
```

Set the generated value as `KEY_ENCRYPTION_MASTER_KEY`. Configure PostgreSQL, public URL, CORS origins, treasury, distinct paymaster/relayer secrets, Stellar RPC, facilitator fee ceiling and xWrapper limits. When the API runs on the host with the included Compose database:

```env
DATABASE_URL=postgresql://autolayer:autolayer@localhost:5434/autolayer
```

Never reuse the automation paymaster as the payment relayer. Never distribute `XWRAPPER_API_KEYS` to console users; it is an administrative/self-hosted operator path. Users authenticate with their wallet and generate personal keys.

## Verify the stack

```bash
curl http://localhost:5001/health
curl http://localhost:5001/supported
curl 'http://localhost:5001/discovery/resources?limit=10&offset=0'
curl http://localhost:5001/v1/skills
pnpm test
pnpm build
```

Useful workspace commands:

```bash
pnpm build:api
pnpm build:web
pnpm build:sdk
pnpm lint
pnpm migrate
pnpm start
```

## Web deployment

The same static web artifact supports two domains:

- `autolayer.fi`: public product website and `/playground`
- `console.autolayer.fi`: console; `/` redirects to `/console`

Build with:

```env
VITE_API_URL=https://core.autolayer.fi
VITE_CONSOLE_URL=https://console.autolayer.fi
```

Documentation links open `https://docs.autolayer.fi`, which should deploy the contents of `docs/`.

## Wallet authentication and user isolation

1. The client requests `POST /v1/auth/challenge` with its G-address and explicit network.
2. The API returns a five-minute, single-use, non-broadcast transaction XDR.
3. The wallet signs the exact envelope.
4. `POST /v1/auth/verify` validates the network, transaction hash, account and signature.
5. The API consumes the challenge and returns a 24-hour bearer session.
6. The user can create, list, rotate and revoke personal API keys under `/v1/api-keys`.

Session and API-key tokens are stored only as SHA-256 hashes. Personal key plaintext is returned once. Wrappers, vault records, request logs, payments and quota counters are scoped by the authenticated user ID.

## Smart contract automation

Generic `CONTRACT_CALL` proposals schedule a typed Soroban invocation. The generated wallet session permits only the selected contract and function, while the stored typed arguments determine each scheduled call.

```ts
import { AutoLayer } from "@autolayer/sdk";

AutoLayer.configure({ environment: "DEVELOPMENT" });

const proposal = await AutoLayer.propose({
  type: "CONTRACT_CALL",
  network: "TESTNET",
  walletAddress: "C...", // AutoLayer-compatible smart account
  validAfterLedger: 100,
  expiresAtLedger: 17_380,
  maxUses: 12,
  schedule: { kind: "CRON", expression: "0 */6 * * *", timezone: "UTC" },
  strategy: {
    contractId: "C...",
    functionName: "autolayer_run",
    args: [
      { type: "address", value: "C..." },
      { type: "u128", value: "10000000" },
      { type: "bool", value: true },
    ],
  },
});
```

Supported argument types are `address`, `i128`, `u128`, `string`, `symbol` and `bool`. Contracts may implement the discovery convention:

```rust
pub trait AutoLayerKeeper {
    fn autolayer_check(env: Env) -> bool;
    fn autolayer_run(env: Env, executor: Address) -> Val;
}
```

The contract remains responsible for authorization, replay protection, execution windows and financial invariants. AutoLayer is a delegated caller, not a substitute for contract security.

## Other automation types

- `DCA`: Aquarius strict-send swaps with bounded input, total and slippage.
- `REBALANCE`: target-weight analysis and policy-limited Aquarius execution.
- `DISBURSEMENT`: one-time or recurring SEP-41 transfers to bounded recipients.

Activation follows four explicit stages: create proposal, sign the smart-account session, settle the activation payment and activate the schedule. Pause, resume and revoke are persisted lifecycle operations.

## x402 facilitator and Bazaar

Standard facilitator endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/supported` | Advertise exact scheme, both Stellar networks and `areFeesSponsored` |
| `POST` | `/verify` | Verify canonical `{ paymentPayload, paymentRequirements }` |
| `POST` | `/settle` | Verify, submit and confirm on-chain settlement |
| `GET` | `/discovery/resources` | Browse HTTP and MCP resources with protocol filters |
| `GET` | `/discovery/search` | Ranked natural-language search with cursor pagination |

AutoLayer builds on the Apache-2.0 `@x402/stellar` package rather than maintaining a private exact verifier. Valid discovery extensions are cataloged only after successful settlement, and the soft-drop result is returned in `EXTENSION-RESPONSES`.

The Stellar `upto` scheme is not advertised until its upstream network specification, recipient-bound settlement design, conformance fixtures and security review are complete.

## xWrapper and xVault2

The authenticated management API provides wrapper CRUD, enable/disable, slug suggestions, analytics and vault-secret creation. The public `/gateway/:slug/*` path:

1. Resolves the enabled owner-scoped wrapper.
2. Returns a canonical x402 challenge when payment is absent.
3. Verifies and settles the signed Stellar authorization.
4. Resolves and decrypts the optional xVault2 credential only in memory.
5. Proxies to the pinned, validated HTTPS upstream.
6. Returns the upstream result with the payment receipt.
7. Records secret-free usage, latency and settlement metadata.

SSRF controls reject userinfo, redirects, non-HTTPS URLs, private/reserved/link-local destinations and unsafe DNS results. Quotas use atomic PostgreSQL counters across replicas.

## Agents, MCP and Skills

`POST /mcp` exposes `search_services` and catalog-restricted `paid_call`. Failures use structured JSON-RPC codes with a non-null `data.reason`.

`GET /v1/skills` supports `query`, `protocol`, `network` and `action` filters. `GET /v1/skills/:slug/spec` returns a versioned agent contract containing action input/output schemas, authentication mode, safety requirements, supported networks and deterministic retry semantics.

## Documentation

The Mintlify site lives under `docs/`:

```bash
cd docs
npx mintlify dev
```

The documentation is organized by reader role:

- Start: concepts, local quickstart and SDK usage
- Build: automation, facilitator, Bazaar, xWrapper and Agent Skills
- API reference: authentication, automation, facilitator, discovery, gateway and MCP/Skills
- Architecture: production topology and security model
- Operations: configuration, deployment, monitoring and self-hosting

## Security and production gates

- Use separate, funded signer accounts and a KMS-backed encryption key in production.
- Keep testnet and mainnet explicit and independently observable.
- Redact authorization XDR, payment signatures, credentials and secrets from logs.
- Reconcile indeterminate settlement timeouts before retrying.
- Run migrations as a single pre-deploy job.
- Complete third-party review and publish live conformance evidence before a production mainnet tag.
- Add catalog origin ownership controls before unrestricted public discovery registration.

See [Security model](docs/architecture/security.mdx) and [Production architecture](docs/architecture/production-architecture.mdx).

## License

Apache-2.0. See [`LICENSE`](LICENSE).
