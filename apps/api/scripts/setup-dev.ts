import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";

const target = resolve(".env");

if (existsSync(target)) {
  console.log("apps/api/.env already exists; leaving it unchanged.");
  process.exit(0);
}

const paymaster = Keypair.random();
const relayer = Keypair.random();

const environment = `NODE_ENV=development
PORT=5001
DATABASE_URL=postgresql://autolayer:autolayer@localhost:5434/autolayer
KEY_ENCRYPTION_MASTER_KEY=${randomBytes(32).toString("base64")}
KEY_ENCRYPTION_VERSION=1
CORS_ORIGINS=http://localhost:5173
PUBLIC_BASE_URL=http://localhost:5001
STELLAR_RPC_KEY=
STELLAR_MAINNET_RPC_URL=https://mainnet.sorobanrpc.com
X402_MAX_TRANSACTION_FEE_STROOPS=50000

TREASURY_G_ACCOUNT=${relayer.publicKey()}
X402_NETWORK=TESTNET
X402_QUOTE_TTL_SECONDS=900
PAYMENT_AUTH_TTL_LEDGERS=300
PAYMENT_CONFIRMATION_TIMEOUT_MS=120000

AUTOMATION_PAYMASTER_SECRET=${paymaster.secret()}
PAYMENT_RELAYER_SECRET=${relayer.secret()}
EXECUTION_MODE=mock

AGENDA_PROCESS_EVERY=5 seconds
AGENDA_MAX_CONCURRENCY=10
JOB_LOCK_LIFETIME_MS=120000
HTTP_TIMEOUT_MS=30000
`;

writeFileSync(target, environment, { encoding: "utf8", mode: 0o600 });
console.log("Created apps/api/.env with local mock-mode keys.");
console.log("These generated accounts are not funded and must not be used for live execution.");
