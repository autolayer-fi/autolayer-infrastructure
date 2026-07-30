import type { Network } from "../api/types.js";

import { env } from "../config/env.js";

export interface AquariusConfig {
  routerContractId: string;
  apiBaseUrl: string;
}

const AQUA_ADDRESSES = {
  TESTNET: "CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD",
  PUBLIC: "CBQDHNBFBZYE4MKPWBSJOPIYLW4SFSXAXUTSXJN76GNKYVYPCKWC6QUK",
} as const;
const AQUA_APIS = {
  TESTNET: "https://amm-api-testnet.aqua.network/api/external/v2",
  PUBLIC: "https://amm-api.aqua.network/api/external/v2",
} as const;

export function getAquariusConfig(network: Network): AquariusConfig {
  return {
    routerContractId: AQUA_ADDRESSES[network],
    apiBaseUrl: AQUA_APIS[network].replace(/\/$/, ""),
  };
}

export function getAquariusRouterContract(network: Network): string {
  return AQUA_ADDRESSES[network];
}
