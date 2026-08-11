import { Asset, Contract, Horizon, Networks, Operation, rpc, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import type { Network } from "./api";
import { signXdr } from "./wallet";

const horizon = (network: Network) => new Horizon.Server(network === "PUBLIC" ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org");
export interface AccountStatus { exists: boolean; network: Network; address: string; nativeBalance?: string }
export async function getAccountStatus(address: string, network: Network): Promise<AccountStatus> {
  if (!address) return { exists: false, network, address };
  try {
    const account = await horizon(network).loadAccount(address);
    return { exists: true, network, address, nativeBalance: account.balances.find(balance => balance.asset_type === "native")?.balance };
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) return { exists: false, network, address };
    throw error;
  }
}
export async function fundTestnetAccount(address: string): Promise<void> {
  const response = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Friendbot could not fund this account (${response.status}). ${detail}`.trim());
  }
}
async function minimumAccountBalance(server: Horizon.Server): Promise<string> {
  const ledgers = await server.ledgers().order("desc").limit(1).call();
  const ledger = ledgers.records[0];
  if (!ledger) throw new Error("Could not read the current Stellar base reserve.");
  // A basic account owns two mandatory ledger entries. Amounts use 7 decimal places.
  const stroops = BigInt(ledger.base_reserve_in_stroops) * 2n;
  return `${stroops / 10_000_000n}.${(stroops % 10_000_000n).toString().padStart(7, "0")}`;
}
function toStroops(amount: string): bigint {
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) throw new Error("Amount must have no more than 7 decimal places.");
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
}
export async function sendXlm(input: { source: string; destination: string; amount: string; network: Network; memo?: string }) {
  const sourceStatus = await getAccountStatus(input.source, input.network);
  if (!sourceStatus.exists) throw new Error(`${input.source} does not exist on ${input.network === "PUBLIC" ? "Stellar Mainnet" : "Stellar Testnet"}. ${input.network === "TESTNET" ? "Fund it with Friendbot first or switch the selected network." : "Fund the account on mainnet or switch networks."}`);
  const destinationStatus = await getAccountStatus(input.destination, input.network);
  const server = horizon(input.network); const account = await server.loadAccount(input.source);
  const passphrase = input.network === "PUBLIC" ? Networks.PUBLIC : Networks.TESTNET;
  if (!destinationStatus.exists) {
    const minimum = await minimumAccountBalance(server);
    if (toStroops(input.amount) < toStroops(minimum)) {
      throw new Error(`Creating this account currently requires at least ${minimum} XLM. Increase the amount and try again.`);
    }
  }
  const operation = destinationStatus.exists
    ? Operation.payment({ destination: input.destination, asset: Asset.native(), amount: input.amount })
    : Operation.createAccount({ destination: input.destination, startingBalance: input.amount });
  const transaction = new TransactionBuilder(account, { fee: "100", networkPassphrase: passphrase })
    .addOperation(operation).setTimeout(60).build();
  const signedXdr = await signXdr(transaction.toXDR(), input.network, input.source);
  const signed = TransactionBuilder.fromXDR(signedXdr, passphrase);
  const result = await server.submitTransaction(signed);
  return { hash: result.hash, ledger: result.ledger, successful: result.successful, createdDestination: !destinationStatus.exists };
}

const rpcUrl = (network: Network) => network === "PUBLIC" ? "https://mainnet.sorobanrpc.com" : "https://soroban-testnet.stellar.org";
export async function getLatestLedger(network: Network): Promise<number> {
  return (await new rpc.Server(rpcUrl(network)).getLatestLedger()).sequence;
}
export async function invokeContract(input: { source: string; contractId: string; functionName: string; argsXdr: string[]; network: Network }) {
  const networkPassphrase = input.network === "PUBLIC" ? Networks.PUBLIC : Networks.TESTNET;
  const server = new rpc.Server(rpcUrl(input.network));
  const source = await server.getAccount(input.source);
  const contract = new Contract(input.contractId);
  const transaction = new TransactionBuilder(source, { fee: "100000", networkPassphrase })
    .addOperation(contract.call(input.functionName, ...input.argsXdr.map(value => xdr.ScVal.fromXDR(value, "base64"))))
    .setTimeout(60)
    .build();
  const simulation = await server.simulateTransaction(transaction);
  if (rpc.Api.isSimulationError(simulation)) throw new Error(`Contract simulation failed: ${simulation.error}`);
  const prepared = rpc.assembleTransaction(transaction, simulation).build();
  const signedXdr = await signXdr(prepared.toXDR(), input.network, input.source);
  const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") throw new Error(`Stellar rejected the transaction: ${sent.errorResult?.toXDR("base64") ?? "unknown error"}`);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise(resolve => window.setTimeout(resolve, 1000));
    const result = await server.getTransaction(sent.hash);
    if (result.status === "SUCCESS") return { hash: sent.hash, ledger: result.ledger };
    if (result.status === "FAILED") throw new Error(`Contract transaction failed: ${result.resultXdr.toXDR("base64")}`);
  }
  throw new Error(`Transaction ${sent.hash} was submitted but confirmation timed out. Check it in Stellar Expert before retrying.`);
}
