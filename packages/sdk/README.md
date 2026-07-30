# @autolayer/sdk

Typed SDK for proposing, paying for, activating, and managing AutoLayer automations.

## API deployment configuration

```ts
import { AutoLayer } from "@autolayer/sdk";

AutoLayer.configure({ environment: "DEVELOPMENT" });
```

Built-in URLs:

```ts
const API_URLS = {
  PRODUCTION: "https://api.autolayer.io",
  DEVELOPMENT: "http://localhost:5001",
} as const;
```

The Stellar `network` remains mandatory in every proposal:

```ts
const proposal = await AutoLayer.propose({
  network: "TESTNET",
  type: "DCA",
  walletAddress: "C...",
  validAfterLedger: 1,
  expiresAtLedger: 100_000,
  schedule: { kind: "INTERVAL", expression: "10 hours" },
  strategy: {
    protocol: { name: "Aqua", contractId: "C...", functionName: "swap" },
    inputAsset: "C...",
    outputAsset: "C...",
    amountPerRun: "100000000",
    maxTotalAmount: "3000000000",
    spendRecipients: ["C..."],
  },
});
```

`TESTNET` and `PUBLIC` are Stellar networks. They do not change the API hostname.

## Custom API URL

```ts
AutoLayer.configure({ apiUrl: "http://localhost:4999" });
```

## Pay during activation

```ts
await AutoLayer.activate(
  proposal,
  {
    policyIdHex,
    transactionHash,
  },
  {
    paymentHandler: async (requirements) => {
      return createX402PaymentSignature(requirements);
    },
  }
);
```

### Disbursement

```ts
await AutoLayer.propose({
  type: "DISBURSEMENT",
  network: "TESTNET",
  walletAddress: "C...",
  validAfterLedger: 100,
  expiresAtLedger: 10000,
  maxUses: 3,
  schedule: { kind: "INTERVAL", expression: "1 hour" },
  strategy: {
    asset: "C...",
    repeat: true,
    recipients: [{ address: "G...", amount: "10000000" }],
  },
});
```
