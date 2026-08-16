# x402 RFP readiness

## Locally complete and verified

- Apache-2.0 self-hostable exact facilitator composition for `stellar:testnet` and `stellar:pubnet` using `@x402/stellar`.
- Sponsored-fee advertisement, signer pool configuration, optional pubnet caller keys, configurable rate limit and pricing declaration.
- Canonical facilitator surfaces and non-null rejection reasons.
- Off-chain PostgreSQL Bazaar browse/search, HTTP and MCP keys, settlement-triggered automatic cataloging, canonical extension response header, hostile-schema/route validation, term binding, and immutable payee updates.
- Search ranking, deterministic pagination, settlement signal, quality corpus, and nDCG/MRR/recall utilities.
- MCP discovery and challenge/retry paid-call tools with structured errors and proxy controls.
- Seller discovery declaration helper, Bazaar client, and wallet-callback paid retry helper.
- Stellar `upto` network specification draft, minimal non-custodial Soroban contract, contract invariant tests, and SDK validation.
- Role-based seller/buyer/operator docs, paid API example, agent example, health endpoints, audit threat model, conformance checker, evidence template, and production dependency-license gate.

## External acceptance gates not claimed complete

These cannot be truthfully completed by repository edits alone:

1. Deploy hosted testnet and pubnet infrastructure with funded signer/channel accounts and production RPC/database/monitoring.
2. Deploy the `upto` contract on each network after independent review, then integrate its final upstream facilitator/client scheme interfaces. The current installed `@x402/stellar` package exposes exact only, so `/supported` intentionally does not advertise a non-functional `upto` handler.
3. Submit and merge `scheme_upto_stellar.md` and implementation into `x402-foundation/x402` through the TSC.
4. Run the unmodified canonical client and upstream x402 e2e suite against both live networks and publish four transaction hashes (network × scheme).
5. Seed a representative live Bazaar, judge the quality corpus against real resource identifiers, and publish measured nDCG@10/MRR/recall/latency.
6. Obtain Audit Bank review, resolve findings, and publish the independent report before the mainnet production tag.
7. Contribute the role-based guide to Stellar Developer Docs and obtain maintainer acceptance.

The evidence table in `docs/conformance/REPORT_TEMPLATE.md` remains `PENDING` until links and hashes exist. This prevents planned work from being misrepresented as delivered conformance.
