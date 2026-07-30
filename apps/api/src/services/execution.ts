import {
  Address,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  hash,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

import { decryptValue } from "../services/crypto.js";

import type {
  Automation,
  DcaStrategy,
  DisbursementStrategy,

} from "../api/types.js";

import { env } from "../config/env.js";
import { ADVISORY_LOCKS, withAdvisoryLock } from "../db/advisory-lock.js";
import { getRpcUrl } from "../constants/rpcUrl.js";
import { getAquariusConfig } from "../constants/aquarius.js";
import {
  getAquariusStrictSendQuote,
  type AquariusMaxDepth,
} from "./aquarius.js";
import {
  buildAquariusRebalancePlan,
  type RebalanceAnalysis,
} from "./rebalance.js";

type PlannedCallArgument =
  | { type: "address"; value: string }
  | { type: "i128"; value: string }
  | { type: "u128"; value: string }
  | { type: "scval"; value: string; encoding: "base64" };

interface PlannedCallMetadata {
  protocol?: "AQUARIUS";
  maxDepth?: AquariusMaxDepth;
  estimatedOutputAmount?: string;
  minimumOutputAmount?: string;
  pools?: string[];
  tokens?: string[];
  rebalance?: RebalanceAnalysis;
}

interface PlannedCall {
  contractId: string;
  functionName: string;
  args: PlannedCallArgument[];
  accountingAmount: string;
  metadata?: PlannedCallMetadata;
}

interface SubmittedCall {
  transactionHash: string;
  contractId: string;
  functionName: string;
  amount: string;
  response: unknown;
}

export interface AutomationExecutionResult {
  status: "EXECUTED" | "SKIPPED";
  transactionHash: string | null;
  transactionHashes: string[];
  amount: string;
  response: {
    calls: SubmittedCall[];
    skipped?: {
      reason: string;
      rebalance?: RebalanceAnalysis;
    };
  };
}

class UnsignedRouteSimulationError extends Error {
  readonly maxDepth: AquariusMaxDepth;
  readonly pools: string[];
  readonly originalError: string;

  constructor(input: {
    maxDepth: AquariusMaxDepth;
    pools: string[];
    originalError: string;
  }) {
    super(
      `Aquarius unsigned route simulation failed at max depth ${input.maxDepth}: ${input.originalError}`
    );
    this.name = "UnsignedRouteSimulationError";
    this.maxDepth = input.maxDepth;
    this.pools = input.pools;
    this.originalError = input.originalError;
  }
}

const AQUARIUS_DEPTH_ORDER: readonly AquariusMaxDepth[] = [3, 2, 1];

function amountFor(automation: Automation): string {
  switch (automation.type) {
    case "DCA":
      return (automation.strategy as DcaStrategy).amountPerRun;

    case "REBALANCE":
      return "0";

    case "DISBURSEMENT":
      return (automation.strategy as DisbursementStrategy).recipients
        .reduce((total, recipient) => total + BigInt(recipient.amount), 0n)
        .toString();
  }
}

function plannedCallsForNonDca(automation: Automation): PlannedCall[] {
  switch (automation.type) {
    case "DISBURSEMENT": {
      const strategy = automation.strategy as DisbursementStrategy;

      if (strategy.recipients.length === 0) {
        throw new Error("Disbursement has no recipients");
      }

      return strategy.recipients.map((recipient) => ({
        contractId: strategy.asset,
        functionName: "transfer",
        accountingAmount: recipient.amount,
        args: [
          { type: "address", value: automation.walletAddress },
          { type: "address", value: recipient.address },
          { type: "i128", value: recipient.amount },
        ],
      }));
    }

    case "DCA":
      throw new Error("DCA must use Aquarius depth fallback execution");

    case "REBALANCE":
      throw new Error("REBALANCE must use Aquarius rebalance execution");
  }
}

async function buildAquariusDcaCall(
  automation: Automation,
  maxDepth: AquariusMaxDepth
): Promise<PlannedCall> {
  if (automation.type !== "DCA") {
    throw new Error("Expected a DCA automation");
  }

  const strategy = automation.strategy as DcaStrategy;
  const config = getAquariusConfig(automation.network);

  if (strategy.protocol.name.toUpperCase() !== "AQUARIUS") {
    throw new Error("Only Aquarius DCA is currently supported");
  }

  if (strategy.protocol.functionName !== "swap_chained") {
    throw new Error("Aquarius DCA must use swap_chained");
  }

  if (strategy.protocol.contractId !== config.routerContractId) {
    throw new Error(
      `Invalid Aquarius router for ${automation.network}. Expected ${config.routerContractId}`
    );
  }

  const quote = await getAquariusStrictSendQuote({
    network: automation.network,
    tokenInContract: strategy.inputAsset,
    tokenOutContract: strategy.outputAsset,
    inputAmount: strategy.amountPerRun,
    slippageBps: strategy.slippageBps,
    maxDepth,
  });

  return {
    contractId: quote.routerContractId,
    functionName: "swap_chained",
    accountingAmount: strategy.amountPerRun,
    metadata: {
      protocol: "AQUARIUS",
      maxDepth,
      estimatedOutputAmount: quote.estimatedOutputAmount,
      minimumOutputAmount: quote.minimumOutputAmount,
      pools: quote.pools,
      tokens: quote.tokens,
    },
    args: [
      { type: "address", value: automation.walletAddress },
      { type: "scval", value: quote.swapChainXdr, encoding: "base64" },
      { type: "address", value: strategy.inputAsset },
      { type: "u128", value: strategy.amountPerRun },
      { type: "u128", value: quote.minimumOutputAmount },
    ],
  };
}

async function buildAquariusRebalanceCall(
  automation: Automation,
  server: rpc.Server,
  paymaster: Keypair,
  maxDepth: AquariusMaxDepth
): Promise<
  | { status: "SKIPPED"; reason: string; analysis: RebalanceAnalysis }
  | { status: "READY"; call: PlannedCall }
> {
  const plan = await buildAquariusRebalancePlan({
    automation,
    server,
    paymaster,
    maxDepth,
  });

  if (plan.status === "SKIPPED") {
    return {
      status: "SKIPPED",
      reason: plan.reason,
      analysis: plan.analysis,
    };
  }

  return {
    status: "READY",
    call: {
      contractId: plan.quote.routerContractId,
      functionName: "swap_chained",
      accountingAmount: plan.inputAmount,
      metadata: {
        protocol: "AQUARIUS",
        maxDepth,
        estimatedOutputAmount: plan.quote.estimatedOutputAmount,
        minimumOutputAmount: plan.quote.minimumOutputAmount,
        pools: plan.quote.pools,
        tokens: plan.quote.tokens,
        rebalance: plan.analysis,
      },
      args: [
        { type: "address", value: automation.walletAddress },
        {
          type: "scval",
          value: plan.quote.swapChainXdr,
          encoding: "base64",
        },
        { type: "address", value: plan.inputAsset },
        { type: "u128", value: plan.inputAmount },
        { type: "u128", value: plan.quote.minimumOutputAmount },
      ],
    },
  };
}

function argumentToScVal(argument: PlannedCallArgument): xdr.ScVal {
  switch (argument.type) {
    case "address":
      return nativeToScVal(argument.value, { type: "address" });

    case "i128":
      return nativeToScVal(BigInt(argument.value), { type: "i128" });

    case "u128":
      return nativeToScVal(BigInt(argument.value), { type: "u128" });

    case "scval":
      return xdr.ScVal.fromXDR(argument.value, argument.encoding);
  }
}

function sessionAuthorizationScVal(
  policyIdHex: string,
  delegateSignature: Buffer
): xdr.ScVal {
  if (!/^[0-9a-fA-F]{64}$/.test(policyIdHex)) {
    throw new Error("Policy ID must be a 32-byte hex string");
  }

  if (delegateSignature.length !== 64) {
    throw new Error("Delegate signature must be exactly 64 bytes");
  }

  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("policy_id"),
      val: xdr.ScVal.scvBytes(Buffer.from(policyIdHex, "hex")),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("signature"),
      val: xdr.ScVal.scvBytes(delegateSignature),
    }),
  ]);
}

function walletSessionAuthScVal(
  policyIdHex: string,
  delegateSignature: Buffer
): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("Session"),
    sessionAuthorizationScVal(policyIdHex, delegateSignature),
  ]);
}

function getAddressCredentials(
  entry: xdr.SorobanAuthorizationEntry
): xdr.SorobanAddressCredentials {
  const credentials = entry.credentials();

  if (
    credentials.switch() !==
    xdr.SorobanCredentialsType.sorobanCredentialsAddress()
  ) {
    throw new Error("Expected Soroban address authorization credentials");
  }

  return credentials.address();
}

function buildAuthorizationPayload(
  entry: xdr.SorobanAuthorizationEntry,
  automation: Automation,
  signatureExpirationLedger: number
): Buffer {
  const credentials = getAddressCredentials(entry);
  const networkId = hash(Buffer.from(Networks[automation.network]));

  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId,
      nonce: credentials.nonce(),
      signatureExpirationLedger,
      invocation: entry.rootInvocation(),
    })
  );

  return hash(preimage.toXDR());
}

function signSessionAuthorizationEntry(
  entry: xdr.SorobanAuthorizationEntry,
  delegate: Keypair,
  automation: Automation,
  signatureExpirationLedger: number
): xdr.SorobanAuthorizationEntry {
  if (!automation.onchainPolicyIdHex) {
    throw new Error("Automation has no on-chain policy");
  }

  const credentials = getAddressCredentials(entry);
  const payload = buildAuthorizationPayload(
    entry,
    automation,
    signatureExpirationLedger
  );
  const delegateSignature = delegate.sign(payload);

  credentials.signatureExpirationLedger(signatureExpirationLedger);
  credentials.signature(
    walletSessionAuthScVal(automation.onchainPolicyIdHex, delegateSignature)
  );

  return entry;
}

function buildCallTransaction(
  sourceAccount: Awaited<ReturnType<rpc.Server["getAccount"]>>,
  call: PlannedCall,
  automation: Automation,
  auth: xdr.SorobanAuthorizationEntry[] = []
) {
  const contractAddress = Address.fromString(call.contractId).toScAddress();
  const invokeContractArgs = new xdr.InvokeContractArgs({
    contractAddress,
    functionName: call.functionName,
    args: call.args.map(argumentToScVal),
  });
  const hostFunction =
    xdr.HostFunction.hostFunctionTypeInvokeContract(invokeContractArgs);

  return new TransactionBuilder(sourceAccount, {
    fee: env.BASE_FEE,
    networkPassphrase: Networks[automation.network],
  })
    .addOperation(Operation.invokeHostFunction({ func: hostFunction, auth }))
    .setTimeout(60)
    .build();
}

function getSuccessfulUnsignedAuthEntries(
  simulation: rpc.Api.SimulateTransactionResponse,
  call: PlannedCall
): xdr.SorobanAuthorizationEntry[] {
  if (rpc.Api.isSimulationError(simulation)) {
    if (call.metadata?.protocol === "AQUARIUS" && call.metadata.maxDepth) {
      throw new UnsignedRouteSimulationError({
        maxDepth: call.metadata.maxDepth,
        pools: call.metadata.pools ?? [],
        originalError: simulation.error,
      });
    }

    throw new Error(simulation.error);
  }

  if (rpc.Api.isSimulationRestore(simulation)) {
    throw new Error("Automation transaction requires ledger-entry restoration");
  }

  return simulation.result?.auth ?? [];
}

async function waitForTransaction(
  server: rpc.Server,
  transactionHash: string
): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  const deadline = Date.now() + env.HTTP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const transaction = await server.getTransaction(transactionHash);

    if (transaction.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return transaction;
    }

    if (transaction.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(
        `Automation transaction failed: ${
          transaction.resultXdr ?? transactionHash
        }`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  throw new Error(
    `Timed out confirming automation transaction ${transactionHash}`
  );
}

function loadDelegate(automation: Automation): Keypair {
  const aad = `autolayer:automation:${automation.id}`;

  const secret = decryptValue(automation.delegatePrivateKeyEncrypted, aad, {
    key: env.masterKey,
    version: env.KEY_ENCRYPTION_VERSION,
  }).toString("utf8");

  const expectedPublicKey = decryptValue(
    automation.delegatePublicKeyEncrypted,
    aad,
    {
      key: env.masterKey,
      version: env.KEY_ENCRYPTION_VERSION,
    }
  ).toString("utf8");

  const delegate = Keypair.fromSecret(secret);

  if (delegate.publicKey() !== expectedPublicKey) {
    throw new Error(
      "Delegate private key does not match stored delegate public key"
    );
  }

  return delegate;
}

async function executeCallLive(
  server: rpc.Server,
  paymaster: Keypair,
  delegate: Keypair,
  automation: Automation,
  call: PlannedCall
): Promise<SubmittedCall> {
  if (!automation.onchainPolicyIdHex) {
    throw new Error("Missing on-chain policy ID");
  }

  const initialSourceAccount = await server.getAccount(paymaster.publicKey());
  const unsignedTransaction = buildCallTransaction(
    initialSourceAccount,
    call,
    automation
  );
  const unsignedSimulation = await server.simulateTransaction(
    unsignedTransaction
  );
  const unsignedAuthEntries = getSuccessfulUnsignedAuthEntries(
    unsignedSimulation,
    call
  );

  if (unsignedAuthEntries.length !== 1) {
    throw new Error(
      `Expected exactly one wallet auth entry, received ${unsignedAuthEntries.length}`
    );
  }

  const unsignedEntry = unsignedAuthEntries[0];
  if (!unsignedEntry) {
    throw new Error("Simulation did not return an authorization entry");
  }

  const latestLedger = await server.getLatestLedger();
  const signatureExpirationLedger =
    latestLedger.sequence + env.AUTOMATION_AUTH_TTL_LEDGERS;
  const signedAuthEntry = signSessionAuthorizationEntry(
    unsignedEntry,
    delegate,
    automation,
    signatureExpirationLedger
  );

  const signedSourceAccount = await server.getAccount(paymaster.publicKey());
  const signedTransaction = buildCallTransaction(
    signedSourceAccount,
    call,
    automation,
    [signedAuthEntry]
  );
  const signedSimulation = await server.simulateTransaction(signedTransaction);

  if (rpc.Api.isSimulationError(signedSimulation)) {
    throw new Error(
      `Signed automation simulation failed: ${signedSimulation.error}`
    );
  }

  if (rpc.Api.isSimulationRestore(signedSimulation)) {
    throw new Error(
      "Signed automation transaction requires ledger-entry restoration"
    );
  }

  const assembled = rpc
    .assembleTransaction(signedTransaction, signedSimulation)
    .build();
  assembled.sign(paymaster);

  const submitted = await server.sendTransaction(assembled);
  if (submitted.status === "ERROR") {
    throw new Error(
      `Automation submission failed: ${JSON.stringify(submitted)}`
    );
  }

  const confirmed = await waitForTransaction(server, submitted.hash);

  return {
    transactionHash: submitted.hash,
    contractId: call.contractId,
    functionName: call.functionName,
    amount: call.accountingAmount,
    response: {
      route: call.metadata,
      submitted,
      confirmed,
    },
  };
}

async function executeAquariusDcaWithDepthFallback(input: {
  automation: Automation;
  server: rpc.Server;
  paymaster: Keypair;
  delegate: Keypair;
}): Promise<SubmittedCall> {
  let lastRouteError: UnsignedRouteSimulationError | undefined;

  for (const maxDepth of AQUARIUS_DEPTH_ORDER) {
    const call = await buildAquariusDcaCall(input.automation, maxDepth);

    try {
      return await executeCallLive(
        input.server,
        input.paymaster,
        input.delegate,
        input.automation,
        call
      );
    } catch (error) {
      if (!(error instanceof UnsignedRouteSimulationError)) {
        throw error;
      }

      lastRouteError = error;

      console.warn("[AutoLayer] Aquarius route failed unsigned simulation", {
        automationId: input.automation.id,
        maxDepth: error.maxDepth,
        pools: error.pools,
        error: error.originalError,
      });
    }
  }

  throw (
    lastRouteError ??
    new Error(
      "Aquarius did not return an executable route at depths 3, 2, or 1"
    )
  );
}

function mockExecution(
  automation: Automation,
  runId: string,
  delegate: Keypair,
  plannedCalls: PlannedCall[]
): AutomationExecutionResult {
  const transactionHash = `mock-${runId}`;
  const payload = Buffer.from(
    runId.replaceAll("-", "").padEnd(64, "0").slice(0, 64),
    "hex"
  );
  const amount = plannedCalls
    .reduce((total, call) => total + BigInt(call.accountingAmount), 0n)
    .toString();

  return {
    status: "EXECUTED",
    transactionHash,
    transactionHashes: [transactionHash],
    amount,
    response: {
      calls: [
        {
          transactionHash,
          contractId: plannedCalls[0]?.contractId ?? "",
          functionName: plannedCalls[0]?.functionName ?? "",
          amount,
          response: {
            delegate: delegate.publicKey(),
            signature: delegate.sign(payload).toString("hex"),
            plannedCalls,
          },
        },
      ],
    },
  };
}

export async function executeAutomation(
  automation: Automation,
  runId: string
): Promise<AutomationExecutionResult> {
  if (!automation.onchainPolicyIdHex) {
    throw new Error("Missing on-chain policy ID");
  }

  const delegate = loadDelegate(automation);

  return withAdvisoryLock(ADVISORY_LOCKS.AUTOMATION_PAYMASTER, async () => {
    const server = new rpc.Server(getRpcUrl(automation.network));
    const paymaster = Keypair.fromSecret(env.AUTOMATION_PAYMASTER_SECRET);

    if (automation.type === "REBALANCE") {
      let lastRouteError: UnsignedRouteSimulationError | undefined;

      for (const maxDepth of AQUARIUS_DEPTH_ORDER) {
        const planned = await buildAquariusRebalanceCall(
          automation,
          server,
          paymaster,
          maxDepth
        );

        if (planned.status === "SKIPPED") {
          return {
            status: "SKIPPED",
            transactionHash: null,
            transactionHashes: [],
            amount: "0",
            response: {
              calls: [],
              skipped: {
                reason: planned.reason,
                rebalance: planned.analysis,
              },
            },
          };
        }

        if (env.EXECUTION_MODE === "mock") {
          return mockExecution(automation, runId, delegate, [planned.call]);
        }
        if (env.EXECUTION_MODE !== "live") {
          throw new Error(`Unsupported execution mode: ${env.EXECUTION_MODE}`);
        }

        try {
          const submitted = await executeCallLive(
            server,
            paymaster,
            delegate,
            automation,
            planned.call
          );

          return {
            status: "EXECUTED",
            transactionHash: submitted.transactionHash,
            transactionHashes: [submitted.transactionHash],
            amount: submitted.amount,
            response: { calls: [submitted] },
          };
        } catch (error) {
          if (!(error instanceof UnsignedRouteSimulationError)) throw error;
          lastRouteError = error;
          console.warn(
            "[AutoLayer] Aquarius rebalance route failed simulation",
            {
              automationId: automation.id,
              maxDepth: error.maxDepth,
              pools: error.pools,
              error: error.originalError,
            }
          );
        }
      }

      throw (
        lastRouteError ??
        new Error("Aquarius did not return an executable rebalance route")
      );
    }

    if (env.EXECUTION_MODE === "mock") {
      const plannedCalls =
        automation.type === "DCA"
          ? [await buildAquariusDcaCall(automation, 3)]
          : plannedCallsForNonDca(automation);
      return mockExecution(automation, runId, delegate, plannedCalls);
    }

    if (env.EXECUTION_MODE !== "live") {
      throw new Error(`Unsupported execution mode: ${env.EXECUTION_MODE}`);
    }

    if (automation.type === "DCA") {
      const submitted = await executeAquariusDcaWithDepthFallback({
        automation,
        server,
        paymaster,
        delegate,
      });

      return {
        status: "EXECUTED",
        transactionHash: submitted.transactionHash,
        transactionHashes: [submitted.transactionHash],
        amount: submitted.amount,
        response: { calls: [submitted] },
      };
    }

    const plannedCalls = plannedCallsForNonDca(automation);
    if (plannedCalls.length === 0) {
      throw new Error("Automation produced no planned calls");
    }

    const submittedCalls: SubmittedCall[] = [];

    for (const call of plannedCalls) {
      submittedCalls.push(
        await executeCallLive(server, paymaster, delegate, automation, call)
      );
    }

    const firstSubmittedCall = submittedCalls[0];
    if (!firstSubmittedCall) {
      throw new Error("Automation produced no submitted transactions");
    }

    return {
      status: "EXECUTED",
      transactionHash: firstSubmittedCall.transactionHash,
      transactionHashes: submittedCalls.map((call) => call.transactionHash),
      amount: submittedCalls
        .reduce((total, call) => total + BigInt(call.amount), 0n)
        .toString(),
      response: { calls: submittedCalls },
    };
  });
}
