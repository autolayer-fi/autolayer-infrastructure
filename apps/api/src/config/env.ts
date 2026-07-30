import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5001),
  DATABASE_URL: z.string().min(1),
  KEY_ENCRYPTION_MASTER_KEY: z.string().min(1),
  KEY_ENCRYPTION_VERSION: z.coerce.number().int().positive().default(1),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  EXECUTION_MODE: z.enum(["mock", "live"]).default("mock"),
  BASE_FEE: z.string().regex(/^\d+$/).default("1000000"),

  AUTOMATION_AUTH_TTL_LEDGERS: z.coerce
    .number()
    .int()
    .min(10)
    .max(1000)
    .default(120),
  STELLAR_RPC_KEY: z.string(),
  AUTOMATION_PAYMASTER_SECRET: z.string().min(56),
  PAYMENT_RELAYER_SECRET: z.string().min(56),
  TREASURY_G_ACCOUNT: z.string().regex(/^G[A-Z2-7]{55}$/),
  PAYMENT_AUTH_TTL_LEDGERS: z.coerce
    .number()
    .int()
    .min(10)
    .max(17280)
    .default(300),
  PAYMENT_CONFIRMATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120000),
  X402_NETWORK: z.enum(["TESTNET", "PUBLIC"]).default("TESTNET"),
  X402_BASE_PRICE: z.string().regex(/^\d+$/).default("500000"),
  X402_QUOTE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:5001"),
  AGENDA_PROCESS_EVERY: z.string().default("5 seconds"),
  AGENDA_MAX_CONCURRENCY: z.coerce.number().int().positive().default(10),
  JOB_LOCK_LIFETIME_MS: z.coerce.number().int().positive().default(120000),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success)
  throw new Error(`Invalid environment: ${parsed.error.message}`);

const masterKey = Buffer.from(parsed.data.KEY_ENCRYPTION_MASTER_KEY, "base64");
if (masterKey.length !== 32) {
  throw new Error("KEY_ENCRYPTION_MASTER_KEY must decode to 32 bytes");
}
if (
  parsed.data.AUTOMATION_PAYMASTER_SECRET === parsed.data.PAYMENT_RELAYER_SECRET
) {
  throw new Error(
    "AUTOMATION_PAYMASTER_SECRET and PAYMENT_RELAYER_SECRET must be different accounts"
  );
}

export const env = {
  ...parsed.data,
  masterKey,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
};
