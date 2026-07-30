import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import type { Automation } from "../api/types.js";

function encrypted(row: any, prefix: string) {
  return {
    ciphertext: String(row[`${prefix}_ciphertext`]),
    iv: String(row[`${prefix}_iv`]),
    tag: String(row[`${prefix}_tag`]),
    version: Number(row.encryption_version),
  };
}

function toAutomation(row: any): Automation {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    network: row.network,
    type: row.type,
    status: row.status,
    expectedPolicyIdHex: row.expected_policy_id_hex,
    onchainPolicyIdHex: row.onchain_policy_id_hex,
    sessionCreationTxHash: row.session_creation_tx_hash,
    delegatePublicKeyEncrypted: encrypted(row, "delegate_public_key"),
    delegatePrivateKeyEncrypted: encrypted(row, "delegate_private_key"),
    policyInput: row.policy_input_json,
    policyInputXdrBase64: row.policy_input_xdr_base64,
    delegatePopHex: row.delegate_pop_hex,
    delegatePopXdrBase64: row.delegate_pop_xdr_base64,
    strategy: row.strategy_json,
    schedule: row.schedule_json,
    validAfterLedger: Number(row.valid_after_ledger),
    expiresAtLedger: Number(row.expires_at_ledger),
    maxUses: row.max_uses === null ? null : Number(row.max_uses),
    runCount: Number(row.run_count),
    spentAmount: String(row.spent_amount),
    agendaJobId: row.agenda_job_id,
    paymentStatus: row.payment_status,
    paymentAmount: String(row.payment_amount),
    paymentAsset: row.payment_asset,
    paymentNetwork: row.payment_network,
    paymentTreasury: row.payment_treasury,
    paymentQuoteExpiresAt: new Date(row.payment_quote_expires_at),
    paymentTxHash: row.payment_tx_hash,
    paymentPayer: row.payment_payer,
  };
}

export interface PaymentSession {
  id: string;
  automationId: string;
  payerAddress: string;
  network: "TESTNET" | "PUBLIC";
  assetContract: string;
  treasuryAddress: string;
  amount: string;
  argsXdr: [string, string, string];
  expiresAtLedger: number;
  quoteExpiresAt: Date;
  status:
    | "PREPARED"
    | "SETTLING"
    | "SUBMITTED"
    | "SETTLED"
    | "FAILED"
    | "EXPIRED";
  signedAuthHash?: string | null;
  transactionHash?: string | null;
}

function toPaymentSession(row: any): PaymentSession {
  return {
    id: row.id,
    automationId: row.automation_id,
    payerAddress: row.payer_address,
    network: row.network,
    assetContract: row.asset_contract,
    treasuryAddress: row.treasury_address,
    amount: String(row.amount),
    argsXdr: row.args_xdr,
    expiresAtLedger: Number(row.expires_at_ledger),
    quoteExpiresAt: new Date(row.quote_expires_at),
    status: row.status,
    signedAuthHash: row.signed_auth_hash,
    transactionHash: row.transaction_hash,
  };
}

export async function insertAutomation(automation: Automation): Promise<void> {
  await pool.query(
    `INSERT INTO automations(
      id,wallet_address,network,type,status,expected_policy_id_hex,
      delegate_public_key_ciphertext,delegate_public_key_iv,delegate_public_key_tag,
      delegate_private_key_ciphertext,delegate_private_key_iv,delegate_private_key_tag,
      encryption_version,policy_input_json,policy_input_xdr_base64,
      delegate_pop_hex,delegate_pop_xdr_base64,strategy_json,schedule_json,
      valid_after_ledger,expires_at_ledger,max_uses,payment_status,payment_amount,
      payment_asset,payment_network,payment_treasury,payment_quote_expires_at
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
    )`,
    [
      automation.id,
      automation.walletAddress,
      automation.network,
      automation.type,
      automation.status,
      automation.expectedPolicyIdHex,
      automation.delegatePublicKeyEncrypted.ciphertext,
      automation.delegatePublicKeyEncrypted.iv,
      automation.delegatePublicKeyEncrypted.tag,
      automation.delegatePrivateKeyEncrypted.ciphertext,
      automation.delegatePrivateKeyEncrypted.iv,
      automation.delegatePrivateKeyEncrypted.tag,
      automation.delegatePrivateKeyEncrypted.version,
      JSON.stringify(automation.policyInput),
      automation.policyInputXdrBase64,
      automation.delegatePopHex,
      automation.delegatePopXdrBase64,
      JSON.stringify(automation.strategy),
      JSON.stringify(automation.schedule),
      automation.validAfterLedger,
      automation.expiresAtLedger,
      automation.maxUses,
      automation.paymentStatus,
      automation.paymentAmount,
      automation.paymentAsset,
      automation.paymentNetwork,
      automation.paymentTreasury,
      automation.paymentQuoteExpiresAt,
    ]
  );
}

export async function getAutomation(id: string): Promise<Automation | null> {
  const query = await pool.query("SELECT * FROM automations WHERE id=$1", [id]);
  return query.rows[0] ? toAutomation(query.rows[0]) : null;
}

export async function createPaymentSession(
  session: PaymentSession
): Promise<void> {
  await pool.query(
    `INSERT INTO payment_sessions(
      id,automation_id,payer_address,network,asset_contract,treasury_address,
      amount,args_xdr,expires_at_ledger,quote_expires_at,status
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      session.id,
      session.automationId,
      session.payerAddress,
      session.network,
      session.assetContract,
      session.treasuryAddress,
      session.amount,
      JSON.stringify(session.argsXdr),
      session.expiresAtLedger,
      session.quoteExpiresAt,
      session.status,
    ]
  );
}

export async function claimPaymentSession(
  sessionId: string,
  automationId: string,
  payloadHash: string
): Promise<PaymentSession> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const query = await client.query(
      "SELECT * FROM payment_sessions WHERE id=$1 AND automation_id=$2 FOR UPDATE",
      [sessionId, automationId]
    );
    if (!query.rows[0]) throw new Error("Payment session not found");
    const session = toPaymentSession(query.rows[0]);
    if (session.status === "SETTLED") {
      await client.query("COMMIT");
      return session;
    }
    if (session.status === "SUBMITTED") {
      await client.query("COMMIT");
      return session;
    }
    if (session.status === "SETTLING") {
      throw new Error("Payment settlement is already in progress");
    }
    if (session.status !== "PREPARED" && session.status !== "FAILED") {
      throw new Error(`Payment session cannot settle from ${session.status}`);
    }
    await client.query(
      `UPDATE payment_sessions
         SET status='SETTLING',signed_auth_hash=$2,error=NULL,updated_at=now()
       WHERE id=$1`,
      [sessionId, payloadHash]
    );
    await client.query("COMMIT");
    return { ...session, status: "SETTLING", signedAuthHash: payloadHash };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markPaymentSessionSubmitted(
  sessionId: string,
  transactionHash: string
): Promise<void> {
  await pool.query(
    `UPDATE payment_sessions
       SET status='SUBMITTED',transaction_hash=$2,updated_at=now()
     WHERE id=$1 AND status='SETTLING'`,
    [sessionId, transactionHash]
  );
}

export async function finalizePaymentSession(
  sessionId: string,
  automationId: string,
  payloadHash: string,
  payer: string,
  transactionHash: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const query = await client.query(
      "SELECT status,signed_auth_hash,transaction_hash FROM payment_sessions WHERE id=$1 AND automation_id=$2 FOR UPDATE",
      [sessionId, automationId]
    );
    if (!query.rows[0]) throw new Error("Payment session not found");
    if (query.rows[0].status === "SETTLED") {
      if (query.rows[0].signed_auth_hash !== payloadHash) {
        throw new Error(
          "Payment session was settled with a different authorization"
        );
      }
      await client.query("COMMIT");
      return;
    }
    if (
      query.rows[0].status !== "SETTLING" &&
      query.rows[0].status !== "SUBMITTED"
    ) {
      throw new Error(
        `Payment session cannot finalize from ${query.rows[0].status}`
      );
    }
    await client.query(
      `UPDATE payment_sessions
         SET status='SETTLED',signed_auth_hash=$2,transaction_hash=$3,
             settled_at=now(),updated_at=now(),error=NULL
       WHERE id=$1`,
      [sessionId, payloadHash, transactionHash]
    );
    await client.query(
      `UPDATE automations
         SET payment_status='PAID',
             status=CASE WHEN status='PROPOSED' THEN 'PAID' ELSE status END,
             payment_session_id=$2,payment_payload_hash=$3,payment_payer=$4,
             payment_tx_hash=$5,updated_at=now()
       WHERE id=$1 AND payment_status <> 'PAID'`,
      [automationId, sessionId, payloadHash, payer, transactionHash]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function failPaymentSession(
  sessionId: string,
  error: string
): Promise<void> {
  await pool.query(
    `UPDATE payment_sessions
       SET status='FAILED',error=$2,updated_at=now()
     WHERE id=$1 AND status='SETTLING'`,
    [sessionId, error.slice(0, 5001)]
  );
}

export async function activateAutomation(
  id: string,
  policyId: string,
  txHash: string,
  jobId: string
): Promise<void> {
  await pool.query(
    `UPDATE automations SET status='ACTIVE',onchain_policy_id_hex=$2,
      session_creation_tx_hash=$3,agenda_job_id=$4,activated_at=now(),updated_at=now()
     WHERE id=$1 AND payment_status='PAID'`,
    [id, policyId, txHash, jobId]
  );
}

export async function setStatus(
  id: string,
  status: Automation["status"]
): Promise<void> {
  await pool.query(
    `UPDATE automations SET status=$2,updated_at=now(),
      revoked_at=CASE WHEN $2='REVOKED' THEN now() ELSE revoked_at END WHERE id=$1`,
    [id, status]
  );
}

export async function runSuccess(
  id: string,
  amount: string,
  tx: string | null
): Promise<void> {
  await pool.query(
    `UPDATE automations SET run_count=run_count+1,spent_amount=spent_amount+$2::numeric,
      last_run_at=now(),last_error=NULL,updated_at=now() WHERE id=$1`,
    [id, amount]
  );
  void tx;
}

export async function runFailure(id: string, error: string): Promise<void> {
  await pool.query(
    "UPDATE automations SET last_run_at=now(),last_error=$2,updated_at=now() WHERE id=$1",
    [id, error.slice(0, 5001)]
  );
}
