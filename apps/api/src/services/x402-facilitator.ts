import { x402Facilitator } from "@x402/core/facilitator";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/facilitator";
import { BAZAAR } from "@x402/extensions/bazaar";
import { env } from "../config/env.js";

const testnetSigners = env.paymentRelayerSecrets.map(secret => createEd25519Signer(secret, "stellar:testnet"));
const pubnetSigners = env.paymentRelayerSecrets.map(secret => createEd25519Signer(secret, "stellar:pubnet"));
export const facilitator = new x402Facilitator()
  .register("stellar:testnet", new ExactStellarScheme(testnetSigners, { areFeesSponsored: true, maxTransactionFeeStroops: env.X402_MAX_TRANSACTION_FEE_STROOPS }))
  .register("stellar:pubnet", new ExactStellarScheme(pubnetSigners, { rpcConfig: { url: env.STELLAR_MAINNET_RPC_URL }, areFeesSponsored: true, maxTransactionFeeStroops: env.X402_MAX_TRANSACTION_FEE_STROOPS }))
  .registerExtension(BAZAAR);

export function parseFacilitatorBody(body: unknown): { paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements } {
  if (!body || typeof body !== "object") throw new Error("Request body must be an object");
  const value = body as Record<string, unknown>;
  if (!value.paymentPayload || !value.paymentRequirements) throw new Error("paymentPayload and paymentRequirements are required");
  return value as unknown as { paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements };
}
