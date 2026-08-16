import { Keypair } from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const baseUrl = (process.argv[2] ?? "http://localhost:5001").replace(/\/$/, "");
const resourceUrl = `${baseUrl}/examples/protocol-spec`;
const payer = Keypair.random();

const friendbot = await fetch(
  `https://friendbot.stellar.org/?addr=${encodeURIComponent(payer.publicKey())}`,
);
if (!friendbot.ok) throw new Error(`Friendbot failed: ${friendbot.status} ${await friendbot.text()}`);

const protocolClient = new x402Client().register(
  "stellar:testnet",
  new ExactStellarScheme(createEd25519Signer(payer.secret(), "stellar:testnet")),
);
const httpClient = new x402HTTPClient(protocolClient);

const initial = await fetch(resourceUrl);
if (initial.status !== 402) throw new Error(`Expected 402, received ${initial.status}: ${await initial.text()}`);
const required = httpClient.getPaymentRequiredResponse(name => initial.headers.get(name), await initial.json());
const selected = required.accepts.find(value => value.network === "stellar:testnet");
if (!selected) throw new Error("The resource did not advertise stellar:testnet");
if (selected.extra?.areFeesSponsored !== true) throw new Error("The resource did not advertise sponsored fees");

const paymentPayload = await httpClient.createPaymentPayload({ ...required, accepts: [selected] });
const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
const paid = await fetch(resourceUrl, { headers: paymentHeaders });
const paidBody = await paid.json();
const parsed = await httpClient.processPaymentResult(
  paymentPayload,
  name => paid.headers.get(name),
  paid.status,
);
const settlement = parsed.settleResponse;
if (paid.status !== 200 || !settlement?.success || !settlement.transaction) {
  throw new Error(`Settlement failed (${paid.status}): ${JSON.stringify(settlement ?? paidBody)}`);
}

const catalog = await fetch(
  `${baseUrl}/discovery/resources?network=stellar:testnet&extensions=bazaar&limit=100`,
).then(response => response.json()) as { items: Array<{ resource: string }> };
const automaticallyCataloged = catalog.items.some(item => item.resource === resourceUrl);
if (!automaticallyCataloged) throw new Error("Paid native Bazaar resource was not automatically cataloged");

console.log(JSON.stringify({
  canonicalPackages: {
    core: "@x402/core@2.21.0",
    stellar: "@x402/stellar@2.21.0",
  },
  network: settlement.network,
  scheme: selected.scheme,
  payer: payer.publicKey(),
  asset: selected.asset,
  amount: selected.amount,
  areFeesSponsored: selected.extra.areFeesSponsored,
  transactionHash: settlement.transaction,
  stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${settlement.transaction}`,
  nativeBazaarExtensionPresent: Boolean(paymentPayload.extensions?.bazaar),
  automaticallyCataloged,
  resource: resourceUrl,
  paidStatus: paid.status,
}, null, 2));
