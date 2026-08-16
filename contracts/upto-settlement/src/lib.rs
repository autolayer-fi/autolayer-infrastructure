#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, BytesN, Env, IntoVal, Symbol};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Consumed(Address, BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    Expired = 1,
    InvalidAmount = 2,
    AlreadySettled = 3,
}

#[contract]
pub struct UptoSettlement;

#[contractimpl]
impl UptoSettlement {
    #[allow(clippy::too_many_arguments)]
    pub fn settle(
        env: Env,
        network: Symbol,
        payer: Address,
        token_address: Address,
        pay_to: Address,
        maximum_amount: i128,
        actual_amount: i128,
        nonce: BytesN<32>,
        expiration_ledger: u32,
        facilitator: Address,
    ) -> Result<i128, Error> {
        if env.ledger().sequence() > expiration_ledger { return Err(Error::Expired); }
        if actual_amount <= 0 || maximum_amount <= 0 || actual_amount > maximum_amount { return Err(Error::InvalidAmount); }

        let key = DataKey::Consumed(payer.clone(), nonce.clone());
        if env.storage().persistent().has(&key) { return Err(Error::AlreadySettled); }

        let domain = Symbol::new(&env, "x402_upto_v1");
        payer.require_auth_for_args((domain, network, env.current_contract_address(), payer.clone(), token_address.clone(), pay_to.clone(), maximum_amount, nonce, expiration_ledger, facilitator.clone()).into_val(&env));
        facilitator.require_auth();

        env.storage().persistent().set(&key, &true);
        let remaining = expiration_ledger.saturating_sub(env.ledger().sequence());
        env.storage().persistent().extend_ttl(&key, remaining.max(17_280), remaining.max(34_560));
        token::Client::new(&env, &token_address).transfer(&payer, &pay_to, &actual_amount);
        Ok(actual_amount)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};

    fn inputs(env: &Env) -> (Address, Address, Address, Address, BytesN<32>) {
        (Address::generate(env), Address::generate(env), Address::generate(env), Address::generate(env), BytesN::from_array(env, &[7; 32]))
    }

    #[test]
    fn rejects_amount_above_cap_before_transfer() {
        let env = Env::default();
        env.ledger().set_sequence_number(100);
        let contract = env.register(UptoSettlement, ());
        let client = UptoSettlementClient::new(&env, &contract);
        let (payer, token, pay_to, facilitator, nonce) = inputs(&env);
        let result = client.try_settle(&Symbol::new(&env, "testnet"), &payer, &token, &pay_to, &100, &101, &nonce, &200, &facilitator);
        assert_eq!(result, Err(Ok(Error::InvalidAmount)));
    }

    #[test]
    fn rejects_expired_authorization_before_transfer() {
        let env = Env::default();
        env.ledger().set_sequence_number(201);
        let contract = env.register(UptoSettlement, ());
        let client = UptoSettlementClient::new(&env, &contract);
        let (payer, token, pay_to, facilitator, nonce) = inputs(&env);
        let result = client.try_settle(&Symbol::new(&env, "testnet"), &payer, &token, &pay_to, &100, &50, &nonce, &200, &facilitator);
        assert_eq!(result, Err(Ok(Error::Expired)));
    }
}
