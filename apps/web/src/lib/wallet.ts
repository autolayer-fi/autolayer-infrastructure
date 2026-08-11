import { Networks } from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit-tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit-tech/stellar-wallets-kit/modules/utils";
import type { Network } from "./api";

let initialized = false;

function initializeWalletKit(): void {
  if (initialized) return;
  StellarWalletsKit.init({ modules: defaultModules(), network: Networks.TESTNET });
  initialized = true;
}

function selectNetwork(network: Network): string {
  initializeWalletKit();
  const passphrase = network === "PUBLIC" ? Networks.PUBLIC : Networks.TESTNET;
  StellarWalletsKit.setNetwork(passphrase);
  return passphrase;
}

export async function connectWallet(): Promise<string> {
  initializeWalletKit();
  const { address } = await StellarWalletsKit.authModal();
  if (!address) throw new Error("The selected wallet did not return an address.");
  return address;
}

export async function restoreWallet(): Promise<string | null> {
  try {
    initializeWalletKit();
    return (await StellarWalletsKit.getAddress()).address || null;
  } catch {
    return null;
  }
}

export async function openWalletProfile(): Promise<string | null> {
  initializeWalletKit();
  await StellarWalletsKit.profileModal();
  return restoreWallet();
}

export async function assertWalletNetwork(network: Network): Promise<void> {
  initializeWalletKit();
  const expected = network === "PUBLIC" ? Networks.PUBLIC : Networks.TESTNET;
  try {
    const current = await StellarWalletsKit.getNetwork();
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
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, { networkPassphrase, address });
  if (!signedTxXdr) throw new Error("The selected wallet did not return a signed transaction.");
  return signedTxXdr;
}

export async function signAuthEntry(authEntryXdr: string, network: Network, address?: string): Promise<string> {
  await assertWalletNetwork(network);
  const networkPassphrase = selectNetwork(network);
  try {
    const { signedAuthEntry } = await StellarWalletsKit.signAuthEntry(authEntryXdr, { networkPassphrase, address });
    if (!signedAuthEntry) throw new Error("Empty authorization signature");
    return signedAuthEntry;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authorization signing failed";
    throw new Error(`This wallet could not sign the Soroban authorization entry. Select a SEP-43 compatible wallet. ${message}`);
  }
}

export async function disconnectWallet(): Promise<void> {
  initializeWalletKit();
  await StellarWalletsKit.disconnect();
}
