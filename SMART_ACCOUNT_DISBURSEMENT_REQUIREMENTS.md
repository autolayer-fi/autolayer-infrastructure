# Smart-account requirements for disbursement

AutoLayer does not identify or branch on wallet providers. It proposes strategies and returns the session material used by the currently connected smart-account integration.

For a transfer-only `DISBURSEMENT` policy, the smart account must:

1. Accept a policy with `permissions: []` when at least one valid `spend_limit` exists.
2. Permit an authorization context consisting only of approved asset `transfer(from, to, amount)` calls.
3. Require `from` to equal the wallet.
4. Require the asset address and recipient to be included in the policy.
5. Enforce the per-call and cumulative limits.
6. Continue rejecting `approve`, `burn`, wallet-management calls, contract creation and unknown contexts.

For the current SocketFi policy implementation, change creation validation from requiring non-empty permissions to requiring at least one permission or spend limit, and remove the final requirement that every session invocation include a non-transfer protocol call.

The initial AutoLayer disbursement policy uses a shared `max_per_call` across all approved recipients and a cumulative `max_total`. This is suitable for testnet and simple equal/capped payments. Recipient-specific exact amounts require a future smart-account policy extension.
