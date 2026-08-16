import "dotenv/config";
import { z } from "zod";

const schema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	PORT: z.coerce.number().int().positive().default(5001),
	DATABASE_URL: z.string().min(1),
	DATABASE_SSL: z
    .string()
    .optional()
    .transform((val) => val === "true"),
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
	STELLAR_MAINNET_RPC_URL: z.string().url().default("https://mainnet.sorobanrpc.com"),
	X402_MAX_TRANSACTION_FEE_STROOPS: z.coerce.number().int().positive().default(50000),
	AUTOMATION_PAYMASTER_SECRET: z.string().min(56),
	PAYMENT_RELAYER_SECRET: z.string().min(56),
	PAYMENT_RELAYER_SECRETS: z.string().optional(),
	X402_MAINNET_API_KEYS: z.string().default(""),
	X402_FACILITATOR_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(100000).default(600),
	X402_MAINNET_PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(0),
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
	X402_TESTNET_EVIDENCE_ASSET: z.string().regex(/^C[A-Z2-7]{55}$/).optional(),
	X402_TESTNET_EVIDENCE_PAY_TO: z.string().regex(/^[GC][A-Z2-7]{55}$/).optional(),
	X402_TESTNET_EVIDENCE_AMOUNT: z.string().regex(/^[1-9]\d*$/).default("10000"),
	X402_QUOTE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
	PUBLIC_BASE_URL: z.string().url().default("http://localhost:5001"),
	AGENDA_PROCESS_EVERY: z.string().default("5 seconds"),
	AGENDA_MAX_CONCURRENCY: z.coerce.number().int().positive().default(10),
	JOB_LOCK_LIFETIME_MS: z.coerce.number().int().positive().default(120000),
	HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
	XWRAPPER_API_KEYS: z.string().default("dev-autolayer-change-me"),
	XWRAPPER_MAX_REDIRECTS: z.coerce.number().int().min(0).max(5).default(0),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success)
	throw new Error(`Invalid environment: ${parsed.error.message}`);
if (parsed.data.NODE_ENV === "production" && parsed.data.XWRAPPER_API_KEYS === "dev-autolayer-change-me") {
	throw new Error("XWRAPPER_API_KEYS must be replaced in production");
}

const masterKey = Buffer.from(parsed.data.KEY_ENCRYPTION_MASTER_KEY, "base64");
if (masterKey.length !== 32) {
	throw new Error("KEY_ENCRYPTION_MASTER_KEY must decode to 32 bytes");
}
if (
	parsed.data.AUTOMATION_PAYMASTER_SECRET === parsed.data.PAYMENT_RELAYER_SECRET
) {
	throw new Error(
		"AUTOMATION_PAYMASTER_SECRET and PAYMENT_RELAYER_SECRET must be different accounts",
	);
}

export const env = {
	...parsed.data,
	masterKey,
	corsOrigins:
		parsed.data.CORS_ORIGINS === "*"
			? "*"
			: parsed.data.CORS_ORIGINS.split(",")
					.map((value) => value.trim())
					.filter(Boolean),
	paymentRelayerSecrets: (parsed.data.PAYMENT_RELAYER_SECRETS || parsed.data.PAYMENT_RELAYER_SECRET)
		.split(",").map(value => value.trim()).filter(Boolean),
	x402MainnetApiKeys: new Set(parsed.data.X402_MAINNET_API_KEYS.split(",").map(value => value.trim()).filter(Boolean)),
};
