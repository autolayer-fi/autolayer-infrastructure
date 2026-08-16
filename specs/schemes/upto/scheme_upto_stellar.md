# Scheme: `upto` on Stellar

Status: implementation draft for upstream review. This document is intended to be contributed to `x402-foundation/x402` through the x402 Technical Steering Committee.

Testnet reference deployment (2026-08-16):

- Contract: `CAKEONFVADOVQW2GSS4KW7QJNSJTTREECOG4WWTXBVZRL63IGKIDYTAJ`
- Wasm SHA-256: `b22c6c8d1d7ebcbe82b0edbfee18728f8e289cc56e1d7e2c5f12863a7c2c9dfa`
- Deploy transaction: `ac9378767a55d7384a270dbb4d73588eb5b6b7b3f28c4c3c5ddc1cd3602b729c`
- Successful partial settlement: `694d41f99865a418184b810c126cc7950f50df42b58040f560c1f011983a695b`

## Networks and version

- x402 v2
- `stellar:testnet`
- `stellar:pubnet`
- SEP-41 token contracts only

## Summary

The client authorizes a maximum integer amount in SEP-41 base units. After measuring usage, the resource server asks the facilitator to settle an `actualAmount` satisfying `0 < actualAmount <= maximumAmount`. A minimal Soroban contract is required: SEP-41 allowance alone cannot simultaneously bind the recipient, bind the facilitator, expire by ledger, and guarantee that a nonce is consumed once.

The contract never holds funds. Its only persistent state is a consumed-nonce marker. It calls the SEP-41 token contract to transfer directly from payer to `payTo`, so neither the facilitator nor AutoLayer takes custody.

## Payment requirements

```json
{
  "scheme": "upto",
  "network": "stellar:testnet",
  "asset": "C...SEP41_TOKEN",
  "amount": "5000000",
  "payTo": "G...SELLER",
  "maxTimeoutSeconds": 60,
  "extra": {
    "areFeesSponsored": true,
    "settlementContract": "C...UPTO_CONTRACT",
    "facilitator": "G...FACILITATOR"
  }
}
```

`amount` is the maximum during payment creation and verification. At settlement, the resource server supplies the actual amount through the standard settlement override mechanism; the settlement response includes `amount` with the charged base-unit amount.

## Authorization

The payer signs a Soroban contract authorization entry for the settlement contract. The contract calls `payer.require_auth_for_args` over:

```text
("x402_upto_v1", network, settlement_contract, payer, token, pay_to,
 maximum_amount, nonce, expiration_ledger, facilitator)
```

`actual_amount` is deliberately excluded so the facilitator can lower the final charge. Every invariant that must not change is included. The facilitator separately authenticates, preventing an unrelated submitter from grief-settling a smaller amount.

The signature expiration ledger is the earlier of the auth entry expiration and the quoted expiration. Clients derive it from `maxTimeoutSeconds` using `ceil(maxTimeoutSeconds / estimatedLedgerSeconds)`, with a five-second fallback, matching exact Stellar behavior.

## Verification

The facilitator MUST independently verify on both `/verify` and `/settle`:

1. x402 version, `upto` scheme, and CAIP-2 network.
2. The payload contains a single expected settlement-contract invocation.
3. Payer authorization binds every tuple field above exactly.
4. SEP-41 asset, payer, payee, maximum, nonce, contract, facilitator, and network equal the requirements/payload.
5. Auth and quoted expiration ledgers are current.
6. Nonce is not consumed.
7. `0 < actualAmount <= maximumAmount` at settlement.
8. Simulation succeeds within the configured fee/resource ceiling.

Settlement MUST repeat full verification and MUST NOT trust an earlier `/verify` result.

## Contract behavior

`settle` authenticates payer and facilitator, rejects expired/zero/over-cap calls, rejects a consumed `(payer, nonce)`, records it before the external token call, extends the marker TTL beyond the authorization lifetime, and invokes SEP-41 `transfer(payer, payTo, actualAmount)`. Transaction atomicity rolls the marker back if transfer fails.

There is no admin, upgrade, withdrawal, escrow, fee, or arbitrary-call surface.

## Smart-account budgets

A custom `__check_auth` account can impose a second boundary over the authorization context: allowed settlement contract, facilitator, token, recipient, per-call maximum, time window, and aggregate spend. The contract cap limits one request; the smart-account policy can limit a session or agent across requests.

## Security and operational notes

- Front running cannot redirect value because token, recipient, facilitator, and nonce are signed.
- A facilitator could settle any positive amount up to the cap; this is inherent in `upto`. The resource server must disclose metering and return the actual amount/receipt.
- The consumed nonce prevents replay and must retain TTL beyond the maximum auth lifetime plus a safety margin.
- The contract adds one persistent write and therefore rent. The facilitator/operator sponsors transaction fees; its business fee is configurable and outside the contract.
- Exact remains contract-free apart from the token contract. Batch settlement and auth-capture are outside this version.
- Contract IDs and audited Wasm hashes must be published separately for testnet and pubnet.

## Conformance cases

Canonical fixtures must cover classic G accounts and custom `__check_auth` accounts, partial and maximum settlement, amount zero/over cap, recipient/asset/facilitator tampering, expired auth, replay, failed token transfer rollback, and concurrent settlement of the same nonce.
