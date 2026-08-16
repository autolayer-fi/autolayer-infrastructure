# AutoLayer x402 RFP update

This update turns AutoLayer into a locally runnable Stellar x402 facilitator, Bazaar discovery service, seller gateway, and agent-facing MCP service. It is built on the Apache-2.0 `@x402/stellar` package and keeps the Bazaar index off-chain in PostgreSQL.

## What works now

### Stellar facilitator

- Canonical `GET /supported`, `POST /verify`, and `POST /settle` surfaces.
- x402 v2 identifiers for `stellar:testnet` and `stellar:pubnet`.
- Exact SEP-41 settlement through `@x402/stellar` rather than a custom reimplementation.
- Sponsored Stellar fees advertised as `extra.areFeesSponsored: true`.
- Classic G-account and custom `__check_auth` behavior delegated to the canonical Stellar scheme.
- Canonical `payload.transaction` accepted without rewriting.
- Non-null machine-readable rejection reasons.
- Optional comma-separated relayer signer pool for burst throughput.
- Configurable request rate, optional mainnet API keys, fee ceiling, and declared mainnet platform fee.
- Liveness and database-readiness endpoints.

### Bazaar discovery

- `GET /discovery/resources` with type, payee, scheme, network, extension, limit, and offset filters.
- `GET /discovery/search` with natural-language PostgreSQL full-text ranking, cursor pagination, and `partialResults`.
- Search weights service/tool names highest, descriptions and tags next, and public resource URLs last.
- Successful settlement count is a bounded secondary ranking signal; deterministic keys break ties.
- HTTP endpoints and MCP tools are first-class resources. MCP identity uses URL plus tool name.
- Successful settlements carrying a Bazaar extension are cataloged automatically.
- xWrapper registration is an explicitly secondary seller-onboarding path.
- Canonical base64 `EXTENSION-RESPONSES` with `success` or `rejected` status.
- Draft 2020-12 schema validation with external `$ref` and `$id` rejection.
- Accepted payment terms must equal the settled requirements.
- Stellar network, SEP-41 contract, base-unit amount, and payee validation.
- Percent-decoded `routeTemplate` traversal and URL-injection rejection.
- Existing listing payees cannot be silently replaced.
- Service metadata follows upstream soft-drop behavior.
- Search-quality corpus and nDCG, reciprocal-rank, and recall utilities.

### xWrapper

xWrapper lets a seller put x402 in front of an existing HTTPS API without changing the upstream application.

- Configure service name, description, tags, public slug, Stellar network, SEP-41 asset, atomic price, and receiving account.
- Wrap public or authenticated upstream APIs.
- Encrypt bearer tokens or custom-header credentials at rest and inject them only upstream.
- Apply per-minute limits, monthly quotas, request-size limits, and response-size limits.
- Block unsafe upstream addresses, private/loopback/link-local destinations, redirects, and oversized responses.
- Return a canonical 402 challenge before payment.
- Verify and settle the signed payment before proxying the request.
- Add enabled wrappers to Bazaar and remove or suppress disabled/deleted wrappers.
- Record request outcomes, payment hashes, latency, and analytics.

### Agent-facing MCP

The MCP endpoint is `POST /mcp` and supports JSON-RPC initialization, tool listing, and tool calls.

`search_services`:

- Searches Bazaar using natural language.
- Accepts optional `stellar:testnet` or `stellar:pubnet` filtering.
- Returns MCP text content and deterministic `structuredContent`.

`paid_call`:

- Accepts only cataloged resources.
- First call can omit `paymentSignature` to inspect the resource's 402 terms.
- Returns `paymentRequired` and `nextAction: SIGN_PAYMENT_AND_RETRY` when authorization is needed.
- A second call supplies the wallet-created canonical payment signature.
- Supports GET, POST, PUT, PATCH, and DELETE.
- Enforces HTTPS in production-facing proxy use, DNS/IP SSRF checks, no redirects, timeout, and response cap.
- Every MCP rejection has a non-null `error.data.reason`.

### TypeScript SDK

- `StellarBazaarClient.list()` browses resources.
- `StellarBazaarClient.search()` performs filtered natural-language search.
- `StellarBazaarClient.paidCall()` performs request → decode challenge → wallet callback → signed retry.
- `declareHttpDiscovery()` creates Bazaar metadata and per-parameter descriptions with minimal boilerplate.
- `validateUptoSettlement()` validates cap, actual amount, ledger expiry, addresses, contract, facilitator, and nonce.

### Stellar `upto`

- Draft `scheme_upto_stellar.md` suitable for x402 TSC review.
- Minimal Apache-2.0 Soroban settlement contract.
- Payer authorization binds network, contract, token, payer, payee, maximum, nonce, expiry, and facilitator.
- Facilitator chooses only the actual amount, which must be positive and no greater than the signed cap.
- Persistent consumed-nonce marker prevents a second settlement.
- Funds move directly from payer to seller; the contract does not escrow or take custody.
- Facilitator authentication limits grief settlement.
- TTL extends consumed nonce state beyond authorization lifetime.
- Smart accounts can impose a second aggregate/session budget.

The local facilitator intentionally does not advertise `upto` yet. It requires audited network deployments and the final upstream client/server/facilitator adapter before it can be represented as operational.

### Security, conformance, and operations

- Apache-2.0 license.
- Reachable production dependency gate rejects AGPL, GPL, SSPL, EUPL, OSL, and CPAL packages.
- Current production graph: 193 checked packages, zero strong-copyleft and zero uncertain licenses.
- GPL/AGPL wallet-kit dependency path removed; frontend uses Freighter directly.
- Wire-level unit fixtures for supported networks, sponsored fees, payload transaction preservation, extension response shape, and non-null errors.
- Hostile Bazaar schema, terms, and route-template tests.
- Docker images for API and frontend, PostgreSQL migrations, health probes, and role-based operator documentation.
- Docker context excludes dependencies, builds, Git data, secrets, and Rust target output.
- Audit threat model and evidence-oriented conformance report template.

## Frontend workflows

Run the stack and open `http://localhost:5173`.

```bash
docker compose up -d --build
```

From the application a developer can:

1. Connect and authenticate with Freighter.
2. Inspect facilitator infrastructure and supported Stellar networks.
3. Create, edit, enable, disable, and delete xWrappers.
4. Configure a public HTTPS upstream service.
5. Add an encrypted credential for an authenticated upstream API.
6. Choose testnet or pubnet, SEP-41 token, integer atomic price, and receiving account.
7. Set request rate, monthly quota, and body/response limits.
8. Copy the generated `/gateway/{slug}` endpoint.
9. Call it without payment and inspect the 402 challenge.
10. Confirm the wrapper appears in Bazaar using its public name, description, or tags.
11. Inspect wrapper request and payment analytics.
12. Browse the Playground, API keys, Agent Skills, and infrastructure views.

Search intentionally indexes public listing metadata, not a private upstream URL or secret. A wrapper named `Todo Items API` with description `Retrieve task and completion data` will match `todo items`; a wrapper named `Test` with description `Having fun` will not.

## Direct HTTP and MCP testing

### Service status

```bash
curl http://localhost:5001/health/live
curl http://localhost:5001/health/ready
curl http://localhost:5001/supported
```

### Browse and search Bazaar

```bash
curl 'http://localhost:5001/discovery/resources?network=stellar:testnet'
curl 'http://localhost:5001/discovery/search?query=weather&network=stellar:testnet&limit=10'
```

### List MCP tools

```bash
curl -X POST http://localhost:5001/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Search from MCP

```bash
curl -X POST http://localhost:5001/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"search_services",
      "arguments":{"query":"weather","network":"stellar:testnet","limit":10}
    }
  }'
```

### Inspect an xWrapper challenge

```bash
curl -i http://localhost:5001/gateway/YOUR_SLUG
```

Decode the `PAYMENT-REQUIRED` header:

```bash
curl -s -D - http://localhost:5001/gateway/YOUR_SLUG -o /dev/null | \
  awk 'BEGIN{IGNORECASE=1} /^PAYMENT-REQUIRED:/{print $2}' | \
  tr -d '\r' | base64 -d | jq
```

### MCP paid-call sequence

For production or an HTTPS tunnel, call `paid_call` without a signature to retrieve terms:

```bash
curl -X POST http://localhost:5001/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{"name":"paid_call","arguments":{"url":"https://YOUR_HOST/gateway/YOUR_SLUG","method":"GET"}}
  }'
```

Sign the returned challenge with a SEP-43-compatible wallet, then repeat with `paymentSignature`. Plain HTTP localhost is rejected by the MCP proxy's production security boundary; direct local gateway challenge testing remains available over curl.

## Verification commands

```bash
pnpm test
pnpm build
pnpm license:check
pnpm conformance:check -- http://localhost:5001
env PATH=/home/tinkerpal/.cargo/bin:$PATH \
  cargo test --locked --manifest-path contracts/upto-settlement/Cargo.toml
```

Current repository verification includes 32 API tests, 11 SDK tests, and 2 Soroban contract tests. API, SDK, frontend, API Docker image, frontend Docker image, migrations, and live health probes pass.

## External deliverables still requiring evidence

Repository functionality is not the same as external acceptance. The following remain explicitly pending:

- Hosted testnet and pubnet production deployments with funded signer/channel accounts.
- Audited `upto` contract IDs and Wasm hashes on both networks.
- Final `upto` adapter registration in `@x402/stellar` and upstream merge through the TSC.
- Unmodified canonical-client exact and `upto` transactions on both networks.
- Passing upstream x402 e2e runs and published transaction hashes.
- Live-catalog search evaluation with published nDCG@10, MRR, recall, and latency.
- Audit Bank review with resolved findings.
- Accepted contribution to Stellar Developer Docs.

See `RFP_READINESS.md` and `docs/conformance/REPORT_TEMPLATE.md` for the evidence checklist.
