import { env } from "../config/env.js";

export type Network = "TESTNET" | "PUBLIC";

const URLS = {
  TESTNET: "https://soroban-testnet.stellar.org",
  PUBLIC: `https://rpc.ankr.com/stellar_soroban/${env.STELLAR_RPC_KEY}`,
} as const;

export function getRpcUrl(network: Network): string {
  return URLS[network];
}
