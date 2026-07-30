import { describe, expect, it, vi } from "vitest";
import { AutoLayer, AutoLayerClient, API_URLS } from "../src/index.js";

const requirements = {
  network: "TESTNET",
  asset: "C...",
  amount: "100",
  payTo: "G...",
};

const proposalResponse = (network: "TESTNET" | "PUBLIC") => ({
  automationId: `auto-${network.toLowerCase()}`,
  network,
  type: "DCA",
  status: "PROPOSED",
  price: { amount: "1", asset: "C...", network: "TESTNET", payTo: "G..." },
  paymentRequirements: requirements,
  expectedPolicyIdHex: "f".repeat(64),
  delegatePublicKey: "G...",
  delegatePublicKeyRawHex: "a".repeat(64),
  delegatePopHex: "b".repeat(128),
  createSessionArgsXdr: ["xdr1", "xdr2"],
  sessionPolicyInput: {},
  payEndpoint: "/pay",
  paymentPrepareEndpoint: "/payment/prepare",
  paymentSettleEndpoint: "/payment/settle",
  activateEndpoint: "/activate",
});

const proposalInput = (network: "TESTNET" | "PUBLIC") => ({
  type: "DCA" as const,
  network,
  walletAddress: "C...",
  validAfterLedger: 1,
  expiresAtLedger: 100,
  schedule: { kind: "INTERVAL" as const, expression: "10 hours" },
  strategy: {
    protocol: { name: "Aqua", contractId: "C...", functionName: "swap" },
    inputAsset: "C...",
    outputAsset: "C...",
    amountPerRun: "1",
    maxTotalAmount: "10",
    spendRecipients: ["C..."],
  },
});

describe("@autolayer/sdk", () => {
  it("uses DEVELOPMENT endpoint and retries activation after x402", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "Payment required",
            paymentRequirements: requirements,
          }),
          {
            status: 402,
            headers: { "content-type": "application/json" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            automationId: "a",
            status: "ACTIVE",
            policyIdHex: "f".repeat(64),
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const client = new AutoLayerClient({
      environment: "DEVELOPMENT",
      fetch: fetchMock as typeof fetch,
    });
    const result = await client.activate(
      { automationId: "a", network: "TESTNET" },
      { policyIdHex: "f".repeat(64), transactionHash: "tx".repeat(20) },
      { paymentHandler: async () => "sig" }
    );

    expect(result.status).toBe("ACTIVE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_URLS.DEVELOPMENT}/v1/automations/a/activate`
    );
    expect(
      (fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>)[
        "PAYMENT-SIGNATURE"
      ]
    ).toBe("sig");
  });

  it("uses the same PRODUCTION API URL for TESTNET and PUBLIC proposals", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(proposalResponse("TESTNET")), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(proposalResponse("PUBLIC")), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      );

    const client = new AutoLayerClient({
      environment: "PRODUCTION",
      fetch: fetchMock as typeof fetch,
    });
    await client.propose(proposalInput("TESTNET"));
    await client.propose(proposalInput("PUBLIC"));

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_URLS.PRODUCTION}/v1/automations/proposals`
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${API_URLS.PRODUCTION}/v1/automations/proposals`
    );
  });

  it("supports an explicit API URL override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(proposalResponse("TESTNET")), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
    );
    const client = new AutoLayerClient({
      apiUrl: "http://localhost:4999/",
      fetch: fetchMock as typeof fetch,
    });
    await client.propose(proposalInput("TESTNET"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4999/v1/automations/proposals"
    );
  });

  it("prepares and settles a self-hosted payment", async () => {
    const prepared = {
      paymentSessionId: "11111111-1111-4111-8111-111111111111",
      automationId: "a",
      network: "TESTNET",
      payerAddress: "C...",
      contractId: "C...",
      functionName: "transfer",
      argsXdr: ["a", "b", "c"],
      unsignedAuthEntriesXdr: ["unsigned"],
      signatureExpirationLedger: 100,
      requirements,
    };
    const settled = {
      automationId: "a",
      paymentStatus: "PAID",
      transactionHash: "tx",
      payer: "C...",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(prepared), { status: 201 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(settled), { status: 200 })
      );
    const client = new AutoLayerClient({
      apiUrl: "http://localhost:5001",
      fetch: fetchMock as typeof fetch,
    });
    const prep = await client.preparePayment(
      { automationId: "a", network: "TESTNET" },
      { payerAddress: "C..." }
    );
    const result = await client.settlePayment(
      { automationId: "a", network: "TESTNET" },
      {
        paymentSessionId: prep.paymentSessionId,
        signedAuthEntriesXdr: ["signed"],
      }
    );
    expect(result.paymentStatus).toBe("PAID");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:5001/v1/automations/a/payment/prepare"
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://localhost:5001/v1/automations/a/payment/settle"
    );
  });
  it("exports the singleton AutoLayer API", () => {
    expect(typeof AutoLayer.propose).toBe("function");
    expect(typeof AutoLayer.activate).toBe("function");
  });
});
