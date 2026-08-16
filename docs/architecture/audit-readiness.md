# Audit readiness and threat model

Audit scope: exact facilitator integration, auth-entry handling delegated to `@x402/stellar`, request/response wire boundary, replay and indeterminate settlement behavior, relayer signer isolation, Bazaar schema and metadata trust boundary, MCP/xWrapper SSRF boundary, secret encryption, and the `upto` contract.

Primary threats and controls:

- Payment tampering: upstream exact verifier independently binds transaction call, asset, amount, recipient, network, auth signatures, and ledger expiry on verify and settle.
- Replay: Stellar auth expiration and transaction semantics for exact; consumed `(payer, nonce)` persistent marker for `upto`.
- Catalog poisoning: successful-settlement gate, accepted/requirements equality, external-schema-reference rejection, upstream schema validation, metadata soft drops, route-template decoding/validation, HTTPS production URLs, and immutable payee on updates.
- SSRF/data exfiltration: HTTPS-only catalog proxying, DNS/IP checks, no redirects, catalog allowlist, timeouts, response caps, and encrypted credential isolation.
- Sequence bottleneck: configurable relayer signer pool and database-coordinated operator deployment.
- Dependency risk: lockfile, Apache-2.0 root, and strong-copyleft CI gate. Missing license metadata is reported for manual review.

The independent reviewer must publish findings and remediation status before a mainnet production tag. This repository does not claim that an internal threat model is a third-party audit.
