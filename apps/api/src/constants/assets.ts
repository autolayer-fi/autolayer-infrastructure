export type Network = "TESTNET" | "PUBLIC";

const USDC = {
  TESTNET: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  PUBLIC: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
} as const;

export function getUsdcContract(network: Network): string {
  return USDC[network];
}

export default USDC;
