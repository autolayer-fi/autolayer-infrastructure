import type { Network } from "../api/types.js";
import { env } from "../config/env.js";
import { getAquariusConfig } from "../constants/aquarius.js";

interface FindPathResponse {
  success?: boolean;
  swap_chain_xdr?: string;
  amount?: string | number;
  pools?: string[];
  tokens?: string[];
  error?: string;
  detail?: string;
  message?: string;
}

export type AquariusMaxDepth = 1 | 2 | 3;

export interface AquariusStrictSendQuote {
  routerContractId: string;
  swapChainXdr: string;
  inputAmount: string;
  estimatedOutputAmount: string;
  minimumOutputAmount: string;
  pools: string[];
  tokens: string[];
  maxDepth: AquariusMaxDepth;
}

function requireUint(value: string, name: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an unsigned integer string`);
  }
}

export function subtractSlippageBps(
  amount: string,
  slippageBps: number
): string {
  requireUint(amount, "amount");

  if (
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 5_000
  ) {
    throw new Error("slippageBps must be an integer between 0 and 5000");
  }

  const minimum = (BigInt(amount) * BigInt(10_000 - slippageBps)) / 10_000n;

  if (minimum <= 0n) {
    throw new Error("Aquarius minimum output is zero after slippage");
  }

  return minimum.toString();
}

function parseFindPathResponse(text: string): FindPathResponse {
  if (!text) return {};

  try {
    return JSON.parse(text) as FindPathResponse;
  } catch {
    throw new Error(`Aquarius returned invalid JSON: ${text.slice(0, 300)}`);
  }
}

export async function getAquariusStrictSendQuote(input: {
  network: Network;
  tokenInContract: string;
  tokenOutContract: string;
  inputAmount: string;
  slippageBps: number;
  maxDepth: AquariusMaxDepth;
}): Promise<AquariusStrictSendQuote> {
  requireUint(input.inputAmount, "inputAmount");

  if (BigInt(input.inputAmount) <= 0n) {
    throw new Error("inputAmount must be positive");
  }

  if (input.tokenInContract === input.tokenOutContract) {
    throw new Error("Aquarius input and output assets must differ");
  }

  if (![1, 2, 3].includes(input.maxDepth)) {
    throw new Error("Aquarius maxDepth must be 1, 2, or 3");
  }

  const config = getAquariusConfig(input.network);
  const controller = new AbortController();
  const timeoutMs = env.HTTP_TIMEOUT_MS * 2;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.apiBaseUrl}/find-path/`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token_in_address: input.tokenInContract,
        token_out_address: input.tokenOutContract,
        amount: input.inputAmount,
        max_depth: input.maxDepth,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    const body = parseFindPathResponse(text);

    if (!response.ok || body.success !== true) {
      throw new Error(
        body.error ??
          body.detail ??
          body.message ??
          `Aquarius find-path failed with HTTP ${response.status}`
      );
    }

    if (!body.swap_chain_xdr) {
      throw new Error("Aquarius response is missing swap_chain_xdr");
    }

    const estimatedOutputAmount = String(body.amount ?? "");
    requireUint(estimatedOutputAmount, "Aquarius amount");

    if (BigInt(estimatedOutputAmount) <= 0n) {
      throw new Error("Aquarius returned a zero output amount");
    }

    return {
      routerContractId: config.routerContractId,
      swapChainXdr: body.swap_chain_xdr,
      inputAmount: input.inputAmount,
      estimatedOutputAmount,
      minimumOutputAmount: subtractSlippageBps(
        estimatedOutputAmount,
        input.slippageBps
      ),
      pools: body.pools ?? [],
      tokens: body.tokens ?? [],
      maxDepth: input.maxDepth,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Aquarius request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
