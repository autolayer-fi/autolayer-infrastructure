import { rpc } from "@stellar/stellar-sdk";
import { getRpcUrl } from "../constants/rpcUrl.js";

export async function resolveFirstRunAt(
  network: "PUBLIC" | "TESTNET",
  validAfterLedger: number
): Promise<Date> {
  const server = new rpc.Server(getRpcUrl(network));

  const latest = await server.getLatestLedger();

  const remainingLedgers = Math.max(0, validAfterLedger - latest.sequence);

  /*
   * Stellar ledgers are approximately five seconds apart.
   * Add a small guard so the session is likely active before execution.
   */
  const delayMs = remainingLedgers * 5_000 + 10_000;

  return new Date(Date.now() + delayMs);
}
