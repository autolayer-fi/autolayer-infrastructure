import { z } from "zod";

const gAddress = z.string().regex(/^G[A-Z2-7]{55}$/);
const stellarAddress = z.string().regex(/^[CG][A-Z2-7]{55}$/);
const contractAddress = z.string().regex(/^C[A-Z2-7]{55}$/);
const uintString = z
  .string()
  .regex(/^\d+$/)
  .refine((value) => BigInt(value) > 0n, "amount must be greater than zero");

const protocol = z.object({
  name: z.string().min(1).max(64),
  contractId: contractAddress,
  functionName: z.string().min(1).max(32),
});

const schedule = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("INTERVAL"),
    expression: z.string().min(1),
    timezone: z.string().default("UTC"),
  }),
  z.object({
    kind: z.literal("CRON"),
    expression: z.string().min(1),
    timezone: z.string().default("UTC"),
  }),
]);

const common = z.object({
  walletAddress: contractAddress,
  network: z.enum(["TESTNET", "PUBLIC"]),
  validAfterLedger: z.number().int().nonnegative(),
  expiresAtLedger: z.number().int().positive(),
  maxUses: z.number().int().positive().nullable().default(null),
  schedule,
});

const dca = z
  .object({
    protocol,
    inputAsset: contractAddress,
    outputAsset: contractAddress,
    amountPerRun: uintString,
    maxTotalAmount: uintString,
    slippageBps: z.number().int().min(0).max(5000).default(100),
    spendRecipients: z.array(stellarAddress).min(1).max(32),
  })
  .superRefine((value, ctx) => {
    if (value.inputAsset === value.outputAsset) {
      ctx.addIssue({
        code: "custom",
        message: "inputAsset and outputAsset must differ",
      });
    }
    if (BigInt(value.amountPerRun) > BigInt(value.maxTotalAmount)) {
      ctx.addIssue({
        code: "custom",
        message: "amountPerRun exceeds maxTotalAmount",
      });
    }
    if (value.protocol.name.toUpperCase() !== "AQUARIUS") {
      ctx.addIssue({
        code: "custom",
        message: "Only AQUARIUS DCA is supported",
      });
    }
    if (value.protocol.functionName !== "swap_chained") {
      ctx.addIssue({
        code: "custom",
        message: "Aquarius DCA must use swap_chained",
      });
    }
  });

const rebalance = z
  .object({
    protocol,
    allowedAssets: z.array(contractAddress).min(2).max(16),
    targetWeightsBps: z
      .array(z.number().int().min(0).max(10_000))
      .min(2)
      .max(16),
    rebalanceThresholdBps: z.number().int().min(1).max(5_000).default(500),
    slippageBps: z.number().int().min(0).max(5_000).default(100),
    maxTradeAmount: uintString,
    maxTotalAmount: uintString,
    spendRecipients: z.array(stellarAddress).min(1).max(16),
  })
  .superRefine((value, context) => {
    if (value.allowedAssets.length !== value.targetWeightsBps.length) {
      context.addIssue({
        code: "custom",
        message: "weights must match assets",
      });
    }
    if (new Set(value.allowedAssets).size !== value.allowedAssets.length) {
      context.addIssue({
        code: "custom",
        path: ["allowedAssets"],
        message: "allowedAssets must not contain duplicates",
      });
    }
    if (
      value.targetWeightsBps.reduce((sum, weight) => sum + weight, 0) !== 10_000
    ) {
      context.addIssue({
        code: "custom",
        message: "weights must total 10000",
      });
    }
  });

const disbursementRecipient = z.object({
  address: stellarAddress,
  amount: uintString,
});

const contractArgument = z.discriminatedUnion("type", [
  z.object({ type: z.literal("address"), value: stellarAddress }),
  z.object({
    type: z.enum(["i128", "u128"]),
    value: z.string().regex(/^\d+$/),
  }),
  z.object({ type: z.literal("string"), value: z.string().max(4096) }),
  z.object({ type: z.literal("symbol"), value: z.string().min(1).max(32) }),
  z.object({ type: z.literal("bool"), value: z.boolean() }),
]);

const contractCall = z.object({
  contractId: contractAddress,
  functionName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/),
  args: z.array(contractArgument).max(32),
});

const disbursement = z
  .object({
    asset: contractAddress,
    recipients: z.array(disbursementRecipient).min(1).max(100),
    repeat: z.boolean(),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.recipients.forEach((recipient, index) => {
      if (seen.has(recipient.address)) {
        context.addIssue({
          code: "custom",
          path: ["recipients", index, "address"],
          message: "duplicate recipient",
        });
      }
      seen.add(recipient.address);
    });
  });

export const proposalSchema = z
  .discriminatedUnion("type", [
    common.extend({ type: z.literal("CONTRACT_CALL"), strategy: contractCall }),
    common.extend({ type: z.literal("DCA"), strategy: dca }),
    common.extend({ type: z.literal("REBALANCE"), strategy: rebalance }),
    common.extend({ type: z.literal("DISBURSEMENT"), strategy: disbursement }),
  ])
  .superRefine((value, context) => {
    if (value.expiresAtLedger <= value.validAfterLedger) {
      context.addIssue({
        code: "custom",
        message: "expiresAtLedger must exceed validAfterLedger",
      });
    }

    if (value.type === "DISBURSEMENT") {
      if (value.strategy.repeat && value.maxUses === null) {
        context.addIssue({
          code: "custom",
          path: ["maxUses"],
          message: "maxUses is required for repeating disbursements",
        });
      }
      if (!value.strategy.repeat && value.maxUses !== 1) {
        context.addIssue({
          code: "custom",
          path: ["maxUses"],
          message: "one-time disbursements require maxUses to equal 1",
        });
      }
    }
  });

export const activateSchema = z.object({
  policyIdHex: z.string().regex(/^[0-9a-fA-F]{64}$/),
  transactionHash: z.string().min(32).max(128),
  firstRunAt: z.string().datetime({ offset: true }),
});

export const paySchema = z.object({}).passthrough();
export { gAddress };

export const paymentPrepareSchema = z.object({
  payerAddress: stellarAddress,
});

export const paymentSettleSchema = z.object({
  paymentSessionId: z.string().uuid(),
  signedAuthEntriesXdr: z.array(z.string().min(1)).length(1),
});
