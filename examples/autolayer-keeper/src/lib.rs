#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone)]
pub struct RunResult {
    pub executed_at: u64,
    pub sequence: u32,
}

#[contract]
pub struct KeeperExample;

/// AutoLayer's discovery convention. `autolayer_check` must be read-only and
/// cheap to simulate. `autolayer_run` must enforce the contract's own
/// authorization and timing rules; never trust an off-chain scheduler alone.
#[contractimpl]
impl KeeperExample {
    pub fn autolayer_check(env: Env) -> bool {
        let next_run: u64 = env.storage().instance().get(&0u32).unwrap_or(0);
        env.ledger().timestamp() >= next_run
    }

    pub fn autolayer_run(env: Env, executor: Address) -> RunResult {
        executor.require_auth();
        if !Self::autolayer_check(env.clone()) {
            panic!("automation is not ready");
        }
        let sequence: u32 = env.storage().instance().get(&1u32).unwrap_or(0) + 1;
        let now = env.ledger().timestamp();
        env.storage().instance().set(&0u32, &(now + 3600));
        env.storage().instance().set(&1u32, &sequence);
        RunResult { executed_at: now, sequence }
    }
}
