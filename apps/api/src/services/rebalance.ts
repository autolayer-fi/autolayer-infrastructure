import {
  Address,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";

import type { Automation, RebalanceStrategy } from "../api/types.js";
import { env } from "../config/env.js";
import { getAquariusConfig } from "../constants/aquarius.js";
import { getUsdcContract } from "../constants/assets.js";
import {
  getAquariusStrictSendQuote,
  type AquariusMaxDepth,
  type AquariusStrictSendQuote,
} from "./aquarius.js";

export interface RebalancePosition {
  asset: string;
  balance: string;
  valueInUsdc: string;
  targetWeightBps: number;
  currentWeightBps: number;
  deviationBps: number;
}

export interface RebalanceAnalysis {
  valuationAsset: string;
  totalValueInUsdc: string;
  thresholdBps: number;
  positions: RebalancePosition[];
  overweightAsset?: string;
  underweightAsset?: string;
  valueToMoveInUsdc?: string;
}

export type RebalancePlan =
  | {
      status: "SKIPPED";
      reason: string;
      analysis: RebalanceAnalysis;
    }
  | {
      status: "READY";
      inputAsset: string;
      outputAsset: string;
      inputAmount: string;
      quote: AquariusStrictSendQuote;
      analysis: RebalanceAnalysis;
    };

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function assertRebalanceStrategy(
  automation: Automation,
  strategy: RebalanceStrategy
): void {
  const config = getAquariusConfig(automation.network);

  if (strategy.protocol.name.toUpperCase() !== "AQUARIUS") {
    throw new Error("Only Aquarius rebalancing is supported");
  }
  if (strategy.protocol.contractId !== config.routerContractId) {
    throw new Error(
      `Invalid Aquarius router for ${automation.network}. Expected ${config.routerContractId}`
    );
  }
  if (strategy.protocol.functionName !== "swap_chained") {
    throw new Error("Aquarius rebalancing must use swap_chained");
  }
  if (strategy.allowedAssets.length < 2) {
    throw new Error("Rebalancing requires at least two assets");
  }
  if (strategy.allowedAssets.length !== strategy.targetWeightsBps.length) {
    throw new Error("Rebalancing target weights must match allowed assets");
  }
  if (new Set(strategy.allowedAssets).size !== strategy.allowedAssets.length) {
    throw new Error("Rebalancing assets must be unique");
  }
  if (strategy.targetWeightsBps.reduce((sum, item) => sum + item, 0) !== 10_000) {
    throw new Error("Rebalancing target weights must total 10000 bps");
  }
  if (
    !Number.isInteger(strategy.rebalanceThresholdBps) ||
    strategy.rebalanceThresholdBps <= 0 ||
    strategy.rebalanceThresholdBps > 5_000
  ) {
    throw new Error("rebalanceThresholdBps must be between 1 and 5000");
  }
}

async function readTokenBalance(input: {
  server: rpc.Server;
  paymaster: Keypair;
  automation: Automation;
  asset: string;
}): Promise<bigint> {
  Address.fromString(input.asset);
  Address.fromString(input.automation.walletAddress);

  const source = await input.server.getAccount(input.paymaster.publicKey());
  const contract = new Contract(input.asset);
  const transaction = new TransactionBuilder(source, {
    fee: env.BASE_FEE,
    networkPassphrase: Networks[input.automation.network],
  })
    .addOperation(
      contract.call(
        "balance",
        Address.fromString(input.automation.walletAddress).toScVal()
      )
    )
    .setTimeout(60)
    .build();

  const simulation = await input.server.simulateTransaction(transaction);

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(
      `Unable to read ${input.asset} balance: ${simulation.error}`
    );
  }
  if (rpc.Api.isSimulationRestore(simulation)) {
    throw new Error(`Balance read for ${input.asset} requires restoration`);
  }

  const returnValue = simulation.result?.retval;
  if (!returnValue) {
    throw new Error(`Balance read for ${input.asset} returned no value`);
  }

  const native = scValToNative(returnValue);
  const balance = BigInt(native.toString());
  if (balance < 0n) {
    throw new Error(`Balance for ${input.asset} cannot be negative`);
  }
  return balance;
}

async function valueAssetInUsdc(input: {
  automation: Automation;
  asset: string;
  balance: bigint;
}): Promise<bigint> {
  if (input.balance === 0n) return 0n;

  const usdc = getUsdcContract(input.automation.network);
  if (input.asset === usdc) return input.balance;

  const quote = await getAquariusStrictSendQuote({
    network: input.automation.network,
    tokenInContract: input.asset,
    tokenOutContract: usdc,
    inputAmount: input.balance.toString(),
    slippageBps: 0,
    maxDepth: 3,
  });

  return BigInt(quote.estimatedOutputAmount);
}

/**
 * Builds a single largest-overweight -> largest-underweight trade.
 * All configured wallet balances participate in the weight calculation.
 * At most one swap is submitted per scheduled check.
 */
export async function buildAquariusRebalancePlan(input: {
  automation: Automation;
  server: rpc.Server;
  paymaster: Keypair;
  maxDepth: AquariusMaxDepth;
}): Promise<RebalancePlan> {
  if (input.automation.type !== "REBALANCE") {
    throw new Error("Expected a REBALANCE automation");
  }

  const strategy = input.automation.strategy as RebalanceStrategy;
  assertRebalanceStrategy(input.automation, strategy);

  const balances = await Promise.all(
    strategy.allowedAssets.map((asset) =>
      readTokenBalance({
        server: input.server,
        paymaster: input.paymaster,
        automation: input.automation,
        asset,
      })
    )
  );

  const values = await Promise.all(
    strategy.allowedAssets.map((asset, index) =>
      valueAssetInUsdc({
        automation: input.automation,
        asset,
        balance: balances[index] ?? 0n,
      })
    )
  );

  const totalValue = values.reduce((sum, value) => sum + value, 0n);
  const baseAnalysis: RebalanceAnalysis = {
    valuationAsset: getUsdcContract(input.automation.network),
    totalValueInUsdc: totalValue.toString(),
    thresholdBps: strategy.rebalanceThresholdBps,
    positions: [],
  };

  if (totalValue === 0n) {
    return {
      status: "SKIPPED",
      reason: "Configured wallet assets have no portfolio value",
      analysis: baseAnalysis,
    };
  }

  const positions: RebalancePosition[] = strategy.allowedAssets.map(
    (asset, index) => {
      const value = values[index] ?? 0n;
      const currentWeightBps = Number((value * 10_000n) / totalValue);
      const targetWeightBps = strategy.targetWeightsBps[index] ?? 0;

      return {
        asset,
        balance: (balances[index] ?? 0n).toString(),
        valueInUsdc: value.toString(),
        targetWeightBps,
        currentWeightBps,
        deviationBps: currentWeightBps - targetWeightBps,
      };
    }
  );

  const overweight = [...positions].sort(
    (a, b) => b.deviationBps - a.deviationBps
  )[0];
  const underweight = [...positions].sort(
    (a, b) => a.deviationBps - b.deviationBps
  )[0];

  const analysis: RebalanceAnalysis = {
    ...baseAnalysis,
    positions,
    ...(overweight && { overweightAsset: overweight.asset }),
    ...(underweight && { underweightAsset: underweight.asset }),
  };

  if (!overweight || !underweight || overweight.asset === underweight.asset) {
    return {
      status: "SKIPPED",
      reason: "No distinct overweight and underweight assets were found",
      analysis,
    };
  }

  if (
    overweight.deviationBps < strategy.rebalanceThresholdBps ||
    Math.abs(underweight.deviationBps) < strategy.rebalanceThresholdBps
  ) {
    return {
      status: "SKIPPED",
      reason: `Portfolio is within the ${strategy.rebalanceThresholdBps} bps rebalance threshold`,
      analysis,
    };
  }

  const overweightValue = BigInt(overweight.valueInUsdc);
  const underweightValue = BigInt(underweight.valueInUsdc);
  const overweightTargetValue =
    (totalValue * BigInt(overweight.targetWeightBps)) / 10_000n;
  const underweightTargetValue =
    (totalValue * BigInt(underweight.targetWeightBps)) / 10_000n;
  const excessValue = overweightValue - overweightTargetValue;
  const deficitValue = underweightTargetValue - underweightValue;
  const valueToMove = minBigInt(excessValue, deficitValue);
  analysis.valueToMoveInUsdc = valueToMove.toString();

  if (valueToMove <= 0n || overweightValue <= 0n) {
    return {
      status: "SKIPPED",
      reason: "Calculated rebalance value is zero",
      analysis,
    };
  }

  const overweightBalance = BigInt(overweight.balance);
  let inputAmount = (overweightBalance * valueToMove) / overweightValue;
  inputAmount = minBigInt(inputAmount, BigInt(strategy.maxTradeAmount));
  inputAmount = minBigInt(inputAmount, overweightBalance);

  if (inputAmount <= 0n) {
    return {
      status: "SKIPPED",
      reason: "Calculated rebalance input amount is zero",
      analysis,
    };
  }

  const quote = await getAquariusStrictSendQuote({
    network: input.automation.network,
    tokenInContract: overweight.asset,
    tokenOutContract: underweight.asset,
    inputAmount: inputAmount.toString(),
    slippageBps: strategy.slippageBps,
    maxDepth: input.maxDepth,
  });

  return {
    status: "READY",
    inputAsset: overweight.asset,
    outputAsset: underweight.asset,
    inputAmount: inputAmount.toString(),
    quote,
    analysis,
  };
}
