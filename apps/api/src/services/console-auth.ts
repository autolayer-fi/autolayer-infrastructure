import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import {
  Account,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { z } from "zod";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";

const wallet = z.string().regex(/^G[A-Z2-7]{55}$/);
export const challengeInput = z.object({
  address: wallet,
  network: z.enum(["TESTNET", "PUBLIC"]).default("TESTNET"),
});
export const verifyInput = z.object({
  challengeId: z.string().uuid(),
  signedXdr: z.string().min(20),
});
export const apiKeyInput = z.object({ name: z.string().trim().min(2).max(80) });
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const passphrase = (network: string) =>
  network === "PUBLIC" ? Networks.PUBLIC : Networks.TESTNET;

export interface AuthRequest extends Request {
  ownerId?: string;
  userId?: string;
  walletAddress?: string;
  authKind?: "session" | "api-key" | "admin";
}

export async function createChallenge(input: z.infer<typeof challengeInput>) {
  const nonce = randomBytes(24).toString("base64url");
  const transaction = new TransactionBuilder(new Account(input.address, "0"), {
    fee: "100",
    networkPassphrase: passphrase(input.network),
  })
    .addOperation(
      Operation.manageData({ name: "autolayer_auth", value: nonce }),
    )
    .setTimeout(300)
    .build();
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  await pool.query(
    "INSERT INTO auth_challenges(id,wallet_address,network,transaction_hash,transaction_xdr,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
    [
      id,
      input.address,
      input.network,
      transaction.hash().toString("hex"),
      transaction.toXDR(),
      expiresAt,
    ],
  );
  return {
    challengeId: id,
    transactionXdr: transaction.toXDR(),
    network: input.network,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function verifyChallenge(input: z.infer<typeof verifyInput>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT * FROM auth_challenges WHERE id=$1 FOR UPDATE",
      [input.challengeId],
    );
    const row = found.rows[0];
    if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now())
      throw new Error("Authentication challenge is invalid or expired");
    verifySignedChallenge(
      input.signedXdr,
      row.network,
      row.transaction_hash,
      row.wallet_address,
    );
    await client.query("UPDATE auth_challenges SET used_at=NOW() WHERE id=$1", [
      row.id,
    ]);
    const userId = randomUUID();
    const user = await client.query(
      "INSERT INTO console_users(id,wallet_address) VALUES($1,$2) ON CONFLICT(wallet_address) DO UPDATE SET last_login_at=NOW() RETURNING id,wallet_address",
      [userId, row.wallet_address],
    );
    const token = `als_${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    await client.query(
      "INSERT INTO console_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)",
      [randomUUID(), user.rows[0].id, hash(token), expiresAt],
    );
    await client.query("COMMIT");
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: { id: user.rows[0].id, walletAddress: user.rows[0].wallet_address },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function verifySignedChallenge(
  signedXdr: string,
  network: string,
  expectedHash: string,
  walletAddress: string,
) {
  const transaction = TransactionBuilder.fromXDR(
    signedXdr,
    passphrase(network),
  );
  if (transaction.hash().toString("hex") !== expectedHash)
    throw new Error(
      "Signed authentication transaction does not match the challenge",
    );
  const signer = Keypair.fromPublicKey(walletAddress);
  if (
    !transaction.signatures.some((entry) =>
      signer.verify(transaction.hash(), entry.signature()),
    )
  )
    throw new Error("Authentication signature is invalid");
  return true;
}

function bearer(request: Request) {
  return (
    request.header("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.header("x-api-key") ||
    ""
  );
}
async function resolveUserCredential(token: string) {
  const tokenHash = hash(token);
  if (token.startsWith("als_")) {
    const result = await pool.query(
      "SELECT s.user_id,u.wallet_address FROM console_sessions s JOIN console_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()",
      [tokenHash],
    );
    if (result.rows[0]) {
      await pool.query(
        "UPDATE console_sessions SET last_used_at=NOW() WHERE token_hash=$1",
        [tokenHash],
      );
      return { ...result.rows[0], kind: "session" as const };
    }
  }
  if (token.startsWith("al_live_")) {
    const result = await pool.query(
      "SELECT k.user_id,u.wallet_address FROM user_api_keys k JOIN console_users u ON u.id=k.user_id WHERE k.key_hash=$1 AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>NOW())",
      [tokenHash],
    );
    if (result.rows[0]) {
      await pool.query(
        "UPDATE user_api_keys SET last_used_at=NOW() WHERE key_hash=$1",
        [tokenHash],
      );
      return { ...result.rows[0], kind: "api-key" as const };
    }
  }
  return null;
}
const adminHashes = env.XWRAPPER_API_KEYS.split(",").map((key) =>
  createHash("sha256").update(key.trim()).digest(),
);
function isAdmin(token: string) {
  const digest = createHash("sha256").update(token).digest();
  return adminHashes.some(
    (candidate) =>
      candidate.length === digest.length && timingSafeEqual(candidate, digest),
  );
}

export async function requireOwner(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
) {
  try {
    const token = bearer(request);
    const user = token ? await resolveUserCredential(token) : null;
    if (user) {
      request.ownerId = user.user_id;
      request.userId = user.user_id;
      request.walletAddress = user.wallet_address;
      request.authKind = user.kind;
      return next();
    }
    if (token && isAdmin(token)) {
      request.ownerId = createHash("sha256")
        .update(createHash("sha256").update(token).digest())
        .digest("hex")
        .slice(0, 32);
      request.authKind = "admin";
      return next();
    }
    return response.status(401).json({
      error: "Connect and authenticate your Stellar wallet",
      code: "UNAUTHORIZED",
    });
  } catch (error) {
    next(error);
  }
}
export async function requireSession(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
) {
  try {
    const user = await resolveUserCredential(bearer(request));
    if (!user || user.kind !== "session")
      return response.status(401).json({
        error: "A wallet-authenticated session is required",
        code: "SESSION_REQUIRED",
      });
    request.ownerId = user.user_id;
    request.userId = user.user_id;
    request.walletAddress = user.wallet_address;
    request.authKind = "session";
    next();
  } catch (error) {
    next(error);
  }
}
export async function listApiKeys(userId: string) {
  const result = await pool.query(
    "SELECT id,name,key_prefix,last_used_at,expires_at,revoked_at,created_at,updated_at FROM user_api_keys WHERE user_id=$1 ORDER BY created_at DESC",
    [userId],
  );
  return result.rows.map(publicKey);
}
function publicKey(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
export async function createApiKey(userId: string, name: string) {
  const key = `al_live_${randomBytes(32).toString("base64url")}`;
  const result = await pool.query(
    "INSERT INTO user_api_keys(id,user_id,name,key_hash,key_prefix) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [randomUUID(), userId, name, hash(key), key.slice(0, 16)],
  );
  return { ...publicKey(result.rows[0]), key };
}
export async function rotateApiKey(userId: string, id: string) {
  const key = `al_live_${randomBytes(32).toString("base64url")}`;
  const result = await pool.query(
    "UPDATE user_api_keys SET key_hash=$3,key_prefix=$4,revoked_at=NULL,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",
    [id, userId, hash(key), key.slice(0, 16)],
  );
  if (!result.rows[0]) throw new Error("API key not found");
  return { ...publicKey(result.rows[0]), key };
}
export async function revokeApiKey(userId: string, id: string) {
  const result = await pool.query(
    "UPDATE user_api_keys SET revoked_at=NOW(),updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING id",
    [id, userId],
  );
  if (!result.rows[0]) throw new Error("API key not found");
}
export async function revokeSession(token: string) {
  await pool.query(
    "UPDATE console_sessions SET revoked_at=NOW() WHERE token_hash=$1",
    [hash(token)],
  );
}
