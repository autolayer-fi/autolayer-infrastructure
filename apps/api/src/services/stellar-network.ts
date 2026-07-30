import { Keypair, Networks } from "@stellar/stellar-sdk";
import type { Network } from "../api/types.js";
import { env } from "../config/env.js";
import { getRpcUrl } from "../constants/rpcUrl.js";

export interface StellarExecutionNetwork {
  rpcUrl: string;
  networkPassphrase: string;
  paymaster: Keypair;
  baseFee: string;
}

export function getStellarExecutionNetwork(
  network: Network
): StellarExecutionNetwork {
  return {
    rpcUrl: getRpcUrl(network),
    networkPassphrase: Networks[network],
    paymaster: Keypair.fromSecret(env.AUTOMATION_PAYMASTER_SECRET),
    baseFee: env.BASE_FEE,
  };
}
