import { createHash, randomUUID } from "node:crypto";
import {
  Address,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  Networks,
} from "@stellar/stellar-sdk";
import type {
  Automation,
  PaymentPrepareResponse,
  PaymentSettlementResponse,
} from "../api/types.js";
import { env } from "../config/env.js";
import { ADVISORY_LOCKS, withAdvisoryLock } from "../db/advisory-lock.js";
import {
  createPaymentSession,
  claimPaymentSession,
  failPaymentSession,
  finalizePaymentSession,
  markPaymentSessionSubmitted,
  type PaymentSession,
} from "./repository.js";
import { getRpcUrl } from "../constants/rpcUrl.js";

export function requirementsFor(automation: Automation) {
  return {
    scheme: "exact-soroban-auth",
    network: automation.paymentNetwork,
    maxAmountRequired: automation.paymentAmount,
    resource: `${env.PUBLIC_BASE_URL}/v1/automations/${automation.id}/activate`,
    description: `Activate AutoLayer ${automation.type} automation ${automation.id}`,
    mimeType: "application/json",
    payTo: automation.paymentTreasury,
    maxTimeoutSeconds: Math.max(
      1,
      Math.floor(
        (automation.paymentQuoteExpiresAt.getTime() - Date.now()) / 1000
      )
    ),
    asset: automation.paymentAsset,
    extra: {
      paymentIdentifier: automation.id,
      automationId: automation.id,
      type: automation.type,
      prepareEndpoint: `/v1/automations/${automation.id}/payment/prepare`,
      settleEndpoint: `/v1/automations/${automation.id}/payment/settle`,
    },
  };
}

function paymentArgs(
  automation: Automation,
  payerAddress: string
): [string, string, string] {
  return [
    nativeToScVal(payerAddress, { type: "address" }).toXDR("base64"),
    nativeToScVal(automation.paymentTreasury, { type: "address" }).toXDR(
      "base64"
    ),
    nativeToScVal(BigInt(automation.paymentAmount), { type: "i128" }).toXDR(
      "base64"
    ),
  ];
}

export function priceFor(maxUses: number): string {
  if (!Number.isInteger(maxUses) || maxUses <= 0) {
    throw new Error("maxUses must be a positive integer");
  }

  const BASE_PRICE = BigInt(env.X402_BASE_PRICE);

  let multiplierBps: bigint;

  if (maxUses <= 100) {
    // 100%
    multiplierBps = 10_000n;
  } else if (maxUses <= 1000) {
    // 75%
    multiplierBps = 7_500n;
  } else {
    // 50%
    multiplierBps = 5_000n;
  }

  return ((BASE_PRICE * BigInt(maxUses) * multiplierBps) / 10_000n).toString();
}

export async function preparePayment(
  automation: Automation,
  payerAddress: string
): Promise<PaymentPrepareResponse> {
  if (automation.paymentStatus === "PAID")
    throw new Error("Automation is already paid");
  if (new Date() > automation.paymentQuoteExpiresAt)
    throw new Error("Payment quote expired");
  Address.fromString(payerAddress);

  const server = new rpc.Server(getRpcUrl(automation.network));
  const latest = await server.getLatestLedger();
  const expiresAtLedger = latest.sequence + env.PAYMENT_AUTH_TTL_LEDGERS;
  const session: PaymentSession = {
    id: randomUUID(),
    automationId: automation.id,
    payerAddress,
    network: automation.network,
    assetContract: automation.paymentAsset,
    treasuryAddress: automation.paymentTreasury,
    amount: automation.paymentAmount,
    argsXdr: paymentArgs(automation, payerAddress),
    expiresAtLedger,
    quoteExpiresAt: automation.paymentQuoteExpiresAt,
    status: "PREPARED",
  };
  const relayer = Keypair.fromSecret(env.PAYMENT_RELAYER_SECRET);
  const source = await server.getAccount(relayer.publicKey());
  const contract = new Contract(automation.paymentAsset);
  const transaction = new TransactionBuilder(source, {
    fee: "1000000",
    networkPassphrase: Networks[automation.network],
  })
    .addOperation(
      contract.call(
        "transfer",
        nativeToScVal(payerAddress, { type: "address" }),
        nativeToScVal(automation.paymentTreasury, { type: "address" }),
        nativeToScVal(BigInt(automation.paymentAmount), { type: "i128" })
      )
    )
    .setTimeout(60)
    .build();
  const simulation = await server.simulateTransaction(transaction);
  if (rpc.Api.isSimulationError(simulation)) throw new Error(simulation.error);
  const unsignedAuthEntriesXdr = (simulation.result?.auth ?? []).map((entry) =>
    entry.toXDR("base64")
  );
  if (unsignedAuthEntriesXdr.length !== 1) {
    throw new Error(
      `Expected one payment authorization entry, received ${unsignedAuthEntriesXdr.length}`
    );
  }

  await createPaymentSession(session);

  return {
    paymentSessionId: session.id,
    automationId: automation.id,
    network: automation.network,
    payerAddress,
    contractId: automation.paymentAsset,
    functionName: "transfer",
    argsXdr: session.argsXdr,
    unsignedAuthEntriesXdr,
    signatureExpirationLedger: expiresAtLedger,
    requirements: requirementsFor(automation),
  };
}

function addressXdr(address: string): string {
  return Address.fromString(address).toScAddress().toXDR("base64");
}

function validateSignedEntry(
  entry: xdr.SorobanAuthorizationEntry,
  session: PaymentSession
): void {
  const credentials: any = entry.credentials();
  if (credentials.switch().name !== "sorobanCredentialsAddress") {
    throw new Error("Payment authorization must use address credentials");
  }
  const addressCredentials: any = credentials.address();
  if (
    addressCredentials.address().toXDR("base64") !==
    addressXdr(session.payerAddress)
  ) {
    throw new Error("Authorization payer does not match payment session");
  }
  if (
    Number(addressCredentials.signatureExpirationLedger()) >
    session.expiresAtLedger
  ) {
    throw new Error(
      "Authorization expiration exceeds prepared payment expiration"
    );
  }

  const invocation: any = entry.rootInvocation();
  if ((invocation.subInvocations()?.length ?? 0) !== 0) {
    throw new Error("Payment authorization must not contain sub-invocations");
  }
  const fn: any = invocation.function();
  if (fn.switch().name !== "sorobanAuthorizedFunctionTypeContractFn") {
    throw new Error("Payment authorization must be a contract function");
  }
  const contractFn: any = fn.contractFn();
  if (
    contractFn.contractAddress().toXDR("base64") !==
    addressXdr(session.assetContract)
  ) {
    throw new Error("Payment asset contract mismatch");
  }
  if (contractFn.functionName().toString() !== "transfer") {
    throw new Error("Payment function must be transfer");
  }
  const args: any[] = contractFn.args();
  if (args.length !== 3)
    throw new Error("Payment transfer must have exactly three arguments");

  const from = String(scValToNative(args[0]));
  const to = String(scValToNative(args[1]));
  const amount = BigInt(scValToNative(args[2]).toString());
  if (from !== session.payerAddress) throw new Error("Payment sender mismatch");
  if (to !== session.treasuryAddress)
    throw new Error("Payment treasury mismatch");
  if (amount !== BigInt(session.amount))
    throw new Error("Payment amount mismatch");
}

function signedEntriesHash(entriesXdr: string[]): string {
  const canonical = entriesXdr
    .map((value) => Buffer.from(value, "base64").toString("hex"))
    .sort();
  return createHash("sha256").update(canonical.join(":"), "utf8").digest("hex");
}

async function waitForTransaction(server: rpc.Server, hash: string) {
  const deadline = Date.now() + env.PAYMENT_CONFIRMATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await server.getTransaction(hash);
    if (result.status === "SUCCESS") return result;
    if (result.status === "FAILED")
      throw new Error(`Payment transaction failed: ${hash}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Payment confirmation timed out: ${hash}`);
}

export async function settlePayment(
  automation: Automation,
  paymentSessionId: string,
  signedAuthEntriesXdr: string[]
): Promise<PaymentSettlementResponse> {
  if (
    !Array.isArray(signedAuthEntriesXdr) ||
    signedAuthEntriesXdr.length !== 1
  ) {
    throw new Error("Exactly one signed authorization entry is required");
  }

  const entries = signedAuthEntriesXdr.map((value) =>
    xdr.SorobanAuthorizationEntry.fromXDR(value, "base64")
  );
  const payloadHash = signedEntriesHash(signedAuthEntriesXdr);
  const session = await claimPaymentSession(
    paymentSessionId,
    automation.id,
    payloadHash
  );

  if (session.status === "SETTLED") {
    return {
      automationId: automation.id,
      paymentStatus: "PAID",
      transactionHash: session.transactionHash!,
      payer: session.payerAddress,
    };
  }

  try {
    if (new Date() > session.quoteExpiresAt)
      throw new Error("Payment quote expired");
    const server = new rpc.Server(getRpcUrl(automation.network));
    if (session.status === "SUBMITTED") {
      if (!session.transactionHash)
        throw new Error("Submitted payment is missing transaction hash");
      await waitForTransaction(server, session.transactionHash);
      await finalizePaymentSession(
        session.id,
        automation.id,
        payloadHash,
        session.payerAddress,
        session.transactionHash
      );
      return {
        automationId: automation.id,
        paymentStatus: "PAID",
        transactionHash: session.transactionHash,
        payer: session.payerAddress,
      };
    }
    const latest = await server.getLatestLedger();
    if (latest.sequence > session.expiresAtLedger)
      throw new Error("Payment authorization expired");
    if (entries.length !== 1) {
      throw new Error("Exactly one signed authorization entry is required");
    }

    const entry = entries[0];

    if (!entry) {
      throw new Error("Signed authorization entry is missing");
    }

    validateSignedEntry(entry, session);

    const sentHash = await withAdvisoryLock(
      ADVISORY_LOCKS.PAYMENT_RELAYER,
      async () => {
        const relayer = Keypair.fromSecret(env.PAYMENT_RELAYER_SECRET);
        const source = await server.getAccount(relayer.publicKey());
        const contract = new Contract(session.assetContract);
        const unsigned = new TransactionBuilder(source, {
          fee: "1000000",
          networkPassphrase: Networks[automation.network],
        })
          .addOperation(
            contract.call(
              "transfer",
              nativeToScVal(session.payerAddress, { type: "address" }),
              nativeToScVal(session.treasuryAddress, { type: "address" }),
              nativeToScVal(BigInt(session.amount), { type: "i128" })
            )
          )
          .setTimeout(60)
          .build();

        const operation: any = unsigned.operations[0];
        const tx = new TransactionBuilder(
          await server.getAccount(relayer.publicKey()),
          {
            fee: "1000000",
            networkPassphrase: Networks[automation.network],
          }
        )
          .addOperation(
            Operation.invokeHostFunction({
              func: operation.func,
              auth: entries,
            })
          )
          .setTimeout(60)
          .build();

        const simulation = await server.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(simulation))
          throw new Error(simulation.error);
        const assembled = rpc.assembleTransaction(tx, simulation).build();
        assembled.sign(relayer);
        const sent = await server.sendTransaction(assembled);
        if (sent.status === "ERROR") throw new Error(JSON.stringify(sent));
        await markPaymentSessionSubmitted(session.id, sent.hash);
        await waitForTransaction(server, sent.hash);

        return sent.hash;
      }
    );

    await finalizePaymentSession(
      session.id,
      automation.id,
      payloadHash,
      session.payerAddress,
      sentHash
    );

    return {
      automationId: automation.id,
      paymentStatus: "PAID",
      transactionHash: sentHash,
      payer: session.payerAddress,
    };
  } catch (error) {
    await failPaymentSession(
      paymentSessionId,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}
