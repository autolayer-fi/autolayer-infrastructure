import { Networks } from "@stellar/stellar-sdk";
import { getAddress, getNetwork, isAllowed, requestAccess, signAuthEntry as freighterSignAuthEntry, signTransaction } from "@stellar/freighter-api";
import type { Network } from "./api";

function selectNetwork(network: Network): string {
  return network === "PUBLIC" ? Networks.PUBLIC : Networks.TESTNET;
}

export async function connectWallet(): Promise<string> {
  const { address, error } = await requestAccess();
  if (error) throw new Error(error.message);
  if (!address) throw new Error("The selected wallet did not return an address.");
  return address;
}

export async function restoreWallet(): Promise<string | null> {
  try {
    const permission = await isAllowed();
    if (!permission.isAllowed) return null;
    return (await getAddress()).address || null;
  } catch {
    return null;
  }
}

export async function openWalletProfile(): Promise<string | null> {
  return connectWallet();
}

export async function assertWalletNetwork(network: Network): Promise<void> {
  const expected = network === "PUBLIC" ? Networks.PUBLIC : Networks.TESTNET;
  try {
    const current = await getNetwork();
    if (current.networkPassphrase && current.networkPassphrase !== expected) {
      throw new Error(`Your wallet is connected to ${current.network || "another network"}. Switch it to ${network === "PUBLIC" ? "Stellar Mainnet" : "Stellar Testnet"} and try again.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Switch it to")) throw error;
    // Some modules do not expose their active network and accept the passphrase per request.
  }
}

export async function signXdr(xdr: string, network: Network, address?: string): Promise<string> {
  await assertWalletNetwork(network);
  const networkPassphrase = selectNetwork(network);
  const { signedTxXdr, error } = await signTransaction(xdr, { networkPassphrase, address });
  if (error) throw new Error(error.message);
  if (!signedTxXdr) throw new Error("The selected wallet did not return a signed transaction.");
  return signedTxXdr;
}

export async function signAuthEntry(authEntryXdr: string, network: Network, address?: string): Promise<string> {
  await assertWalletNetwork(network);
  const networkPassphrase = selectNetwork(network);
  try {
    const { signedAuthEntry, error } = await freighterSignAuthEntry(authEntryXdr, { networkPassphrase, address });
    if (error) throw new Error(error.message);
    if (!signedAuthEntry) throw new Error("Empty authorization signature");
    return typeof signedAuthEntry === "string"
      ? signedAuthEntry
      : signedAuthEntry.toString("base64");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authorization signing failed";
    throw new Error(`This wallet could not sign the Soroban authorization entry. Select a SEP-43 compatible wallet. ${message}`);
  }
}

export async function disconnectWallet(): Promise<void> {
  // Freighter intentionally owns connection permission. AutoLayer clears its
  // local session; users revoke site permission in the wallet when desired.
}
