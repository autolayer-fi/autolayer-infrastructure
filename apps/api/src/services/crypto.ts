import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  Address,
  Keypair,
  StrKey,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import type {
  AssetSpendLimitInput,
  EncryptedValue,
  ProtocolPermission,
  SessionPolicyInput,
} from "../api/types.js";

const ALGORITHM = "aes-256-gcm";
const POLICY_DOMAIN = Buffer.from("SOCKETFI_SESSION_POLICY_V1", "utf8");
const POP_DOMAIN = Buffer.from("SOCKETFI_SESSION_POP_V1", "utf8");

export interface EncryptionContext {
  key: Buffer;
  version: number;
}

export function encryptValue(
  value: Buffer,
  aad: string,
  context: EncryptionContext
): EncryptedValue {
  if (context.key.length !== 32)
    throw new Error("Encryption key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, context.key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    version: context.version,
  };
}

export function decryptValue(
  value: EncryptedValue,
  aad: string,
  context: EncryptionContext
): Buffer {
  if (value.version !== context.version) {
    throw new Error(`Unsupported encryption version ${value.version}`);
  }
  if (context.key.length !== 32)
    throw new Error("Encryption key must be 32 bytes");
  const decipher = createDecipheriv(
    ALGORITHM,
    context.key,
    Buffer.from(value.iv, "base64")
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]);
}

function sha256(...parts: Buffer[]): Buffer {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest();
}

function symbol(name: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(name);
}

function map(entries: Array<[string, xdr.ScVal]>): xdr.ScVal {
  const sorted = [...entries].sort(([a], [b]) => a.localeCompare(b));
  return xdr.ScVal.scvMap(
    sorted.map(
      ([key, value]) => new xdr.ScMapEntry({ key: symbol(key), val: value })
    )
  );
}

function vec(values: xdr.ScVal[]): xdr.ScVal {
  return xdr.ScVal.scvVec(values);
}

function permissionToScVal(value: ProtocolPermission): xdr.ScVal {
  return map([
    ["contract", Address.fromString(value.contract).toScVal()],
    ["function", symbol(value.function)],
  ]);
}

function spendLimitToScVal(value: AssetSpendLimitInput): xdr.ScVal {
  return map([
    ["asset", Address.fromString(value.asset).toScVal()],
    [
      "max_per_call",
      nativeToScVal(BigInt(value.max_per_call), { type: "i128" }),
    ],
    ["max_total", nativeToScVal(BigInt(value.max_total), { type: "i128" })],
    [
      "recipients",
      vec(value.recipients.map((item) => Address.fromString(item).toScVal())),
    ],
  ]);
}

export function sessionPolicyInputToScVal(
  input: SessionPolicyInput
): xdr.ScVal {
  const delegate = StrKey.decodeEd25519PublicKey(input.delegate);
  return map([
    ["delegate", xdr.ScVal.scvBytes(delegate)],
    ["expires_at_ledger", xdr.ScVal.scvU32(input.expires_at_ledger)],
    [
      "max_uses",
      input.max_uses === null
        ? xdr.ScVal.scvVoid()
        : xdr.ScVal.scvU32(input.max_uses),
    ],
    ["permissions", vec(input.permissions.map(permissionToScVal))],
    ["salt", xdr.ScVal.scvBytes(Buffer.from(input.salt, "hex"))],
    ["spend_limits", vec(input.spend_limits.map(spendLimitToScVal))],
    ["valid_after_ledger", xdr.ScVal.scvU32(input.valid_after_ledger)],
  ]);
}

export function bytesNScVal(value: Buffer): xdr.ScVal {
  return xdr.ScVal.scvBytes(value);
}

export function buildSessionMaterial(params: {
  walletAddress: string;
  delegateKeypair: Keypair;
  validAfterLedger: number;
  expiresAtLedger: number;
  maxUses: number | null;
  permissions: ProtocolPermission[];
  spendLimits: AssetSpendLimitInput[];
}): {
  input: SessionPolicyInput;
  inputScVal: xdr.ScVal;
  inputXdrBase64: string;
  expectedPolicyId: Buffer;
  delegatePop: Buffer;
  delegatePopXdrBase64: string;
} {
  const input: SessionPolicyInput = {
    salt: randomBytes(32).toString("hex"),
    delegate: params.delegateKeypair.publicKey(),
    valid_after_ledger: params.validAfterLedger,
    expires_at_ledger: params.expiresAtLedger,
    max_uses: params.maxUses,
    permissions: params.permissions,
    spend_limits: params.spendLimits,
  };
  const inputScVal = sessionPolicyInputToScVal(input);
  const inputXdr = inputScVal.toXDR();
  const walletXdr = Address.fromString(params.walletAddress).toScVal().toXDR();
  const expectedPolicyId = sha256(POLICY_DOMAIN, walletXdr, inputXdr);
  const popChallenge = sha256(POP_DOMAIN, walletXdr, inputXdr);
  const delegatePop = params.delegateKeypair.sign(popChallenge);
  return {
    input,
    inputScVal,
    inputXdrBase64: inputXdr.toString("base64"),
    expectedPolicyId,
    delegatePop,
    delegatePopXdrBase64: bytesNScVal(delegatePop).toXDR().toString("base64"),
  };
}
