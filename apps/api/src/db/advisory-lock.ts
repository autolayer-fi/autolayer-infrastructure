import { pool } from "./pool.js";

/**
 * Cross-process lock backed by PostgreSQL. Use a stable 31-bit integer key.
 * Session-level locks are released even when the callback throws.
 */
export async function withAdvisoryLock<T>(
  key: number,
  operation: () => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [key]);
    return await operation();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [key]);
    } finally {
      client.release();
    }
  }
}

export const ADVISORY_LOCKS = {
  AUTOMATION_PAYMASTER: 1_804_001,
  PAYMENT_RELAYER: 1_804_002,
} as const;
