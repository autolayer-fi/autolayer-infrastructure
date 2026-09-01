import { StellarBazaarClient } from "@autolayer/sdk";

const bazaar = new StellarBazaarClient(process.env.AUTOLAYER_URL ?? "http://localhost:5001");
// Point this example at a running core deployment or use AUTOLAYER_URL for staging/CI runs.
const matches = await bazaar.search("weather forecast by city", { network: "stellar:testnet", type: "http" });
const resource = matches.resources[0];
if (!resource) throw new Error("No matching service");

const response = await bazaar.paidCall(resource.resource, async paymentRequired => {
  // Connect a SEP-43-compatible wallet here. It must return the canonical
  // base64 PaymentPayload after signing Soroban auth entries.
  return globalThis.prompt?.(`Sign this x402 challenge: ${JSON.stringify(paymentRequired)}`) ?? "";
});
console.log(response.status, await response.text());
