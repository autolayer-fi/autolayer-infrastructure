import type { StellarNetwork } from "./x402.js";

export interface StellarUptoAuthorization {
  network: StellarNetwork;
  settlementContract: string;
  payer: string;
  asset: string;
  payTo: string;
  maximumAmount: string;
  nonce: string;
  expirationLedger: number;
  facilitator: string;
}

export function validateUptoSettlement(authorization: StellarUptoAuthorization, actualAmount: string, currentLedger: number): void {
  const maximum = BigInt(authorization.maximumAmount);
  const actual = BigInt(actualAmount);
  if (actual <= 0n || maximum <= 0n || actual > maximum) throw new Error("UPTO_AMOUNT_OUT_OF_RANGE");
  if (currentLedger > authorization.expirationLedger) throw new Error("UPTO_AUTHORIZATION_EXPIRED");
  if (!/^C[A-Z2-7]{55}$/.test(authorization.settlementContract)) throw new Error("UPTO_CONTRACT_INVALID");
  if (!/^C[A-Z2-7]{55}$/.test(authorization.asset)) throw new Error("UPTO_ASSET_INVALID");
  if (!/^[GC][A-Z2-7]{55}$/.test(authorization.payer) || !/^[GC][A-Z2-7]{55}$/.test(authorization.payTo)) throw new Error("UPTO_PARTY_INVALID");
  if (!/^G[A-Z2-7]{55}$/.test(authorization.facilitator)) throw new Error("UPTO_FACILITATOR_INVALID");
  if (!/^[0-9a-f]{64}$/i.test(authorization.nonce)) throw new Error("UPTO_NONCE_INVALID");
}
