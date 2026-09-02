import { randomUUID } from "node:crypto";

import { Router, type Router as ExpressRouter } from "express";

import { Keypair } from "@stellar/stellar-sdk";

import { env } from "../config/env.js";

import {
  buildSessionMaterial,
  decryptValue,
  encryptValue,
} from "../services/crypto.js";

import type {
  AssetSpendLimitInput,
  Automation,
  ProtocolPermission,
} from "./types.js";

import { activateSchema, proposalSchema } from "./schemas.js";

import {
  activateAutomation,
  decodeAutomationCursor,
  getAutomation,
  getAutomationsByWalletPage,
  insertAutomation,
  setStatus,
} from "../services/repository.js";

import {
  preparePayment,
  priceFor,
  requirementsFor,
  settlePayment,
} from "../services/payment.js";

import {
  cancelAutomationJob,
  scheduleAutomation,
} from "../jobs/automation-job.js";

import { getUsdcContract } from "../constants/assets.js";

import { getAquariusRouterContract } from "../constants/aquarius.js";
import {
  facilitator,
  parseFacilitatorBody,
} from "../services/x402-facilitator.js";
import {
  catalogPayment,
  encodeCatalogOutcome,
  listResources,
  searchResources,
} from "../services/bazaar.js";
import { checkFacilitatorAccess } from "../services/facilitator-access.js";
import { pool } from "../db/pool.js";

export const routes: ExpressRouter = Router();

function discoveryFilters(query: Record<string, unknown>) {
  const number = (value: unknown, fallback: number, max: number) =>
    Math.min(Math.max(Number(value) || fallback, 0), max);
  const extensions =
    typeof query.extensions === "string"
      ? query.extensions
      : Array.isArray(query.extensions)
        ? query.extensions.flatMap(value => typeof value === "string" ? value.split(",") : []).join(",")
        : undefined;
  return {
    type: typeof query.type === "string" ? query.type : undefined,
    payTo: typeof query.payTo === "string" ? query.payTo : undefined,
    scheme: typeof query.scheme === "string" ? query.scheme : undefined,
    network: typeof query.network === "string" ? query.network : undefined,
    extensions,
    limit: number(query.limit, 20, 100),
    offset: number(query.offset, 0, 1_000_000),
  };
}

routes.get("/supported", (_request, response) =>
  response.json(facilitator.getSupported()),
);
routes.post("/verify", async (request, response) => {
  try {
    const { paymentPayload, paymentRequirements } = parseFacilitatorBody(
      request.body,
    );
    const denied = checkFacilitatorAccess(request, paymentRequirements);
    if (denied) return response.status(denied.includes("RATE") ? 429 : 401).json({ isValid: false, invalidReason: denied, invalidMessage: denied });
    const result = await facilitator.verify(
      paymentPayload,
      paymentRequirements,
    );
    if (!result.isValid && !result.invalidReason)
      result.invalidReason = "PAYMENT_VERIFICATION_FAILED";
    response.setHeader(
      "EXTENSION-RESPONSES",
      encodeCatalogOutcome({
        success: false,
        reason: "Cataloging occurs only after successful settlement",
      }),
    );
    return response.json(result);
  } catch (error) {
    return response
      .status(400)
      .json({
        isValid: false,
        invalidReason: "INVALID_REQUEST",
        invalidMessage:
          error instanceof Error
            ? error.message
            : "Invalid facilitator request",
      });
  }
});
routes.post("/settle", async (request, response) => {
  try {
    const { paymentPayload, paymentRequirements } = parseFacilitatorBody(
      request.body,
    );
    const denied = checkFacilitatorAccess(request, paymentRequirements);
    if (denied) return response.status(denied.includes("RATE") ? 429 : 401).json({ success: false, errorReason: denied, errorMessage: denied, transaction: "", network: paymentRequirements.network });
    const result = await facilitator.settle(
      paymentPayload,
      paymentRequirements,
    );
    if (!result.success && !result.errorReason)
      result.errorReason = "PAYMENT_SETTLEMENT_FAILED";
    const catalog = result.success
      ? await catalogPayment(paymentPayload, paymentRequirements)
      : {
          success: false as const,
          reason: result.errorReason || "Settlement failed",
        };
    response.setHeader("EXTENSION-RESPONSES", encodeCatalogOutcome(catalog));
    return response.json(result);
  } catch (error) {
    return response
      .status(400)
      .json({
        success: false,
        errorReason: "INVALID_REQUEST",
        errorMessage:
          error instanceof Error
            ? error.message
            : "Invalid facilitator request",
        transaction: "",
        network: "stellar:testnet",
      });
  }
});
routes.get("/discovery/resources", async (request, response, next) => {
  try {
    return response.json(await listResources(discoveryFilters(request.query)));
  } catch (error) {
    next(error);
  }
});
routes.get("/discovery/search", async (request, response, next) => {
  try {
    const query =
      typeof request.query.query === "string" ? request.query.query.trim() : "";
    if (!query)
      return response
        .status(400)
        .json({ error: "query is required", code: "QUERY_REQUIRED" });
    const cursor =
      typeof request.query.cursor === "string"
        ? Number(Buffer.from(request.query.cursor, "base64url").toString())
        : 0;
    return response.json(
      await searchResources(query, {
        ...discoveryFilters(request.query),
        offset: Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0,
      }),
    );
  } catch (error) {
    next(error);
  }
});

routes.get("/health/live", (_request, response) => response.json({ status: "ok" }));
routes.get("/health/ready", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ready", facilitator: ["stellar:testnet", "stellar:pubnet"], bazaar: "ready" });
  } catch {
    response.status(503).json({ status: "not_ready", reason: "DATABASE_UNAVAILABLE" });
  }
});

interface PolicyRules {
  permissions: ProtocolPermission[];
  limits: AssetSpendLimitInput[];

  /**
   * Number of successful smart-account authorization
   * entries permitted by the on-chain session.
   *
   * This can differ from the number of scheduled
   * AutoLayer runs.
   */
  sessionMaxUses: number | null;
}

function buildPolicyRules(
  proposal: ReturnType<typeof proposalSchema.parse>,
): PolicyRules {
  switch (proposal.type) {
    case "CONTRACT_CALL":
      return {
        permissions: [
          {
            contract: proposal.strategy.contractId,
            function: proposal.strategy.functionName,
          },
        ],
        limits: [],
        sessionMaxUses: proposal.maxUses,
      };

    case "DCA": {
      const expectedRouter = getAquariusRouterContract(proposal.network);

      if (proposal.strategy.protocol.name.toUpperCase() !== "AQUARIUS") {
        throw new Error("Only Aquarius DCA is currently supported");
      }

      if (proposal.strategy.protocol.contractId !== expectedRouter) {
        throw new Error(
          `Invalid Aquarius router for ${proposal.network}. Expected ${expectedRouter}`,
        );
      }

      if (proposal.strategy.protocol.functionName !== "swap_chained") {
        throw new Error("Aquarius DCA must use swap_chained");
      }

      if (proposal.strategy.inputAsset === proposal.strategy.outputAsset) {
        throw new Error("DCA input and output assets must be different");
      }

      if (
        BigInt(proposal.strategy.amountPerRun) >
        BigInt(proposal.strategy.maxTotalAmount)
      ) {
        throw new Error("DCA amountPerRun exceeds maxTotalAmount");
      }

      return {
        permissions: [
          {
            contract: expectedRouter,

            function: "swap_chained",
          },
        ],

        limits: [
          {
            asset: proposal.strategy.inputAsset,

            /*
             * These addresses must match the recipients
             * appearing in Aquarius's nested input-token
             * transfer authorization contexts.
             */
            recipients: proposal.strategy.spendRecipients,

            max_per_call: proposal.strategy.amountPerRun,

            max_total: proposal.strategy.maxTotalAmount,
          },
        ],

        /*
         * One Aquarius swap produces one wallet session
         * authorization, so one scheduled DCA run consumes
         * one session use.
         */
        sessionMaxUses: proposal.maxUses,
      };
    }

    case "REBALANCE": {
      const expectedRouter = getAquariusRouterContract(proposal.network);

      if (proposal.strategy.protocol.name.toUpperCase() !== "AQUARIUS") {
        throw new Error("Only Aquarius rebalancing is currently supported");
      }

      if (proposal.strategy.protocol.contractId !== expectedRouter) {
        throw new Error(
          `Invalid Aquarius router for ${proposal.network}. Expected ${expectedRouter}`,
        );
      }

      if (proposal.strategy.protocol.functionName !== "swap_chained") {
        throw new Error("Aquarius rebalancing must use swap_chained");
      }

      if (proposal.strategy.allowedAssets.length < 2) {
        throw new Error("Rebalancing requires at least two assets");
      }

      if (
        new Set(proposal.strategy.allowedAssets).size !==
        proposal.strategy.allowedAssets.length
      ) {
        throw new Error("Rebalancing assets must be unique");
      }

      return {
        permissions: [
          {
            contract: expectedRouter,
            function: "swap_chained",
          },
        ],

        limits: proposal.strategy.allowedAssets.map((asset) => ({
          asset,
          recipients: proposal.strategy.spendRecipients,
          max_per_call: proposal.strategy.maxTradeAmount,
          max_total: proposal.strategy.maxTotalAmount,
        })),

        /*
         * A skipped portfolio check does not invoke the wallet and consumes no
         * session use. Every submitted Aquarius rebalance consumes one use.
         */
        sessionMaxUses: proposal.maxUses,
      };
    }

    case "DISBURSEMENT": {
      if (proposal.strategy.recipients.length === 0) {
        throw new Error("Disbursement requires at least one recipient");
      }

      const amounts = proposal.strategy.recipients.map((recipient) =>
        BigInt(recipient.amount),
      );

      const maxPerCall = amounts.reduce(
        (maximum, amount) => (amount > maximum ? amount : maximum),
        0n,
      );

      const totalPerRun = amounts.reduce((total, amount) => total + amount, 0n);

      /*
       * proposal.maxUses represents the requested number
       * of scheduled disbursement batches.
       */
      const scheduledRunLimit = proposal.maxUses;

      /*
       * If no run limit is supplied, the spend-limit total
       * covers one run. For an unlimited session, consider
       * requiring an explicit financial maximum instead.
       */
      const runMultiplier = BigInt(scheduledRunLimit ?? 1);

      /*
       * The current disbursement executor submits one
       * separate transfer transaction per recipient.
       *
       * Therefore:
       *
       * session uses =
       * scheduled batch runs × recipient count
       */
      const sessionMaxUses =
        scheduledRunLimit === null
          ? null
          : scheduledRunLimit * proposal.strategy.recipients.length;

      return {
        permissions: [],

        limits: [
          {
            asset: proposal.strategy.asset,

            recipients: proposal.strategy.recipients.map(
              (recipient) => recipient.address,
            ),

            max_per_call: maxPerCall.toString(),

            max_total: (totalPerRun * runMultiplier).toString(),
          },
        ],

        sessionMaxUses,
      };
    }
  }
}

type PublicAutomationState =
  | "PROPOSED"
  | "PAYMENT_REQUIRED"
  | "READY_TO_ACTIVATE"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED"
  | "EXPIRED";

function deriveAutomationState(automation: Automation): {
  state: PublicAutomationState;
  isTerminal: boolean;
  isPaused: boolean;
  isCancelled: boolean;
  isExpired: boolean;
  hasReachedRunLimit: boolean;
  remainingRuns: number | null;
} {
  const status = String(automation.status).toUpperCase();
  const hasReachedRunLimit =
    automation.maxUses !== null && automation.runCount >= automation.maxUses;
  const remainingRuns =
    automation.maxUses === null
      ? null
      : Math.max(automation.maxUses - automation.runCount, 0);

  if (status === "REVOKED" || status === "CANCELLED") {
    return {
      state: "CANCELLED",
      isTerminal: true,
      isPaused: false,
      isCancelled: true,
      isExpired: false,
      hasReachedRunLimit,
      remainingRuns,
    };
  }

  if (status === "EXPIRED") {
    return {
      state: "EXPIRED",
      isTerminal: true,
      isPaused: false,
      isCancelled: false,
      isExpired: true,
      hasReachedRunLimit,
      remainingRuns,
    };
  }

  if (hasReachedRunLimit) {
    return {
      state: "COMPLETED",
      isTerminal: true,
      isPaused: false,
      isCancelled: false,
      isExpired: false,
      hasReachedRunLimit: true,
      remainingRuns: 0,
    };
  }

  if (status === "PAUSED") {
    return {
      state: "PAUSED",
      isTerminal: false,
      isPaused: true,
      isCancelled: false,
      isExpired: false,
      hasReachedRunLimit,
      remainingRuns,
    };
  }

  if (status === "ACTIVE") {
    return {
      state: "ACTIVE",
      isTerminal: false,
      isPaused: false,
      isCancelled: false,
      isExpired: false,
      hasReachedRunLimit,
      remainingRuns,
    };
  }

  if (status === "PAID") {
    return {
      state: "READY_TO_ACTIVATE",
      isTerminal: false,
      isPaused: false,
      isCancelled: false,
      isExpired: false,
      hasReachedRunLimit,
      remainingRuns,
    };
  }

  if (status === "FAILED") {
    return {
      state: "FAILED",
      isTerminal: false,
      isPaused: false,
      isCancelled: false,
      isExpired: false,
      hasReachedRunLimit,
      remainingRuns,
    };
  }

  return {
    state:
      automation.paymentStatus === "PAID"
        ? "READY_TO_ACTIVATE"
        : automation.paymentStatus === "REQUIRED"
          ? "PAYMENT_REQUIRED"
          : "PROPOSED",
    isTerminal: false,
    isPaused: false,
    isCancelled: false,
    isExpired: false,
    hasReachedRunLimit,
    remainingRuns,
  };
}

function publicAutomation(automation: Automation) {
  return {
    id: automation.id,
    network: automation.network,
    type: automation.type,
    status: automation.status,
    ...deriveAutomationState(automation),
    walletAddress: automation.walletAddress,
    policyIdHex: automation.onchainPolicyIdHex,
    expectedPolicyIdHex: automation.expectedPolicyIdHex,
    delegatePublicKey: decryptValue(
      automation.delegatePublicKeyEncrypted,
      `autolayer:automation:${automation.id}`,
      {
        key: env.masterKey,
        version: env.KEY_ENCRYPTION_VERSION,
      },
    ).toString(),
    strategy: automation.strategy,
    schedule: automation.schedule,
    validAfterLedger: automation.validAfterLedger,
    expiresAtLedger: automation.expiresAtLedger,
    scheduledRunLimit: automation.maxUses,
    sessionAuthorizationLimit: automation.policyInput.max_uses,
    agendaJobId: automation.agendaJobId,
    payment: {
      status: automation.paymentStatus,
      amount: automation.paymentAmount,
      asset: automation.paymentAsset,
      network: automation.paymentNetwork,
      payTo: automation.paymentTreasury,
      transactionHash: automation.paymentTxHash,
      payer: automation.paymentPayer,
    },
    runCount: automation.runCount,
    spentAmount: automation.spentAmount,
    nextRunAt: automation.nextRunAt?.toISOString() ?? null,
    lastRunAt: automation.lastRunAt?.toISOString() ?? null,
    lastFinishedAt: automation.lastFinishedAt?.toISOString() ?? null,
    createdAt: automation.createdAt?.toISOString() ?? null,
    updatedAt: automation.updatedAt?.toISOString() ?? null,
    activatedAt: automation.activatedAt?.toISOString() ?? null,
    revokedAt: automation.revokedAt?.toISOString() ?? null,
    lastError: automation.lastError,
  };
}

routes.get("/health", (_request, response) => {
  return response.json({
    ok: true,

    service: "autolayer",

    mode: env.EXECUTION_MODE,

    automationPaymasters: {
      TESTNET: Keypair.fromSecret(env.AUTOMATION_PAYMASTER_SECRET).publicKey(),

      PUBLIC: Keypair.fromSecret(env.AUTOMATION_PAYMASTER_SECRET).publicKey(),
    },

    paymentRelayer: Keypair.fromSecret(env.PAYMENT_RELAYER_SECRET).publicKey(),

    treasury: env.TREASURY_G_ACCOUNT,
  });
});

routes.post("/v1/automations/proposals", async (request, response, next) => {
  try {
    const proposal = proposalSchema.parse(request.body);

    const id = randomUUID();

    const delegateKeypair = Keypair.random();

    const { permissions, limits, sessionMaxUses } = buildPolicyRules(proposal);

    const material = buildSessionMaterial({
      walletAddress: proposal.walletAddress,

      delegateKeypair,

      validAfterLedger: proposal.validAfterLedger,

      expiresAtLedger: proposal.expiresAtLedger,

      /*
       * On-chain session authorization limit.
       *
       * For disbursement, this may be:
       * scheduled runs × recipient count.
       */
      maxUses: sessionMaxUses,

      permissions,

      spendLimits: limits,
    });

    const aad = `autolayer:automation:${id}`;

    const scheduledRuns = proposal.maxUses;

    if (scheduledRuns === null) {
      throw new Error(
        "A finite maxUses is required when pricing automation per run",
      );
    }

    const paymentAmount = priceFor(scheduledRuns);

    const automation: Automation = {
      id,

      walletAddress: proposal.walletAddress,

      network: proposal.network,

      type: proposal.type,

      status: "PROPOSED",

      expectedPolicyIdHex: material.expectedPolicyId.toString("hex"),

      onchainPolicyIdHex: null,

      sessionCreationTxHash: null,

      delegatePublicKeyEncrypted: encryptValue(
        Buffer.from(delegateKeypair.publicKey()),
        aad,
        {
          key: env.masterKey,

          version: env.KEY_ENCRYPTION_VERSION,
        },
      ),

      delegatePrivateKeyEncrypted: encryptValue(
        Buffer.from(delegateKeypair.secret()),
        aad,
        {
          key: env.masterKey,

          version: env.KEY_ENCRYPTION_VERSION,
        },
      ),

      policyInput: material.input,

      policyInputXdrBase64: material.inputXdrBase64,

      delegatePopHex: material.delegatePop.toString("hex"),

      delegatePopXdrBase64: material.delegatePopXdrBase64,

      strategy: proposal.strategy,

      schedule: proposal.schedule,

      validAfterLedger: proposal.validAfterLedger,

      expiresAtLedger: proposal.expiresAtLedger,

      /*
       * AutoLayer run limit.
       *
       * This remains the requested scheduled-run count,
       * not the expanded wallet session-use limit.
       */
      maxUses: proposal.maxUses,

      runCount: 0,

      spentAmount: "0",

      agendaJobId: null,

      paymentStatus: "REQUIRED",

      paymentAmount,

      paymentAsset: getUsdcContract(proposal.network),

      paymentNetwork: proposal.network,

      paymentTreasury: env.TREASURY_G_ACCOUNT,

      paymentQuoteExpiresAt: new Date(
        Date.now() + env.X402_QUOTE_TTL_SECONDS * 1000,
      ),

      paymentTxHash: null,

      paymentPayer: null,

      nextRunAt: null,

      lastRunAt: null,

      lastFinishedAt: null,

      createdAt: null,

      updatedAt: null,

      activatedAt: null,

      revokedAt: null,

      lastError: null,
    };

    await insertAutomation(automation);

    return response.status(201).json({
      automationId: id,

      network: automation.network,

      type: automation.type,

      status: automation.status,

      price: {
        amount: automation.paymentAmount,

        asset: automation.paymentAsset,

        network: automation.paymentNetwork,

        payTo: automation.paymentTreasury,
      },

      paymentRequirements: requirementsFor(automation),

      expectedPolicyIdHex: automation.expectedPolicyIdHex,

      delegatePublicKey: delegateKeypair.publicKey(),

      delegatePublicKeyRawHex: Buffer.from(
        delegateKeypair.rawPublicKey(),
      ).toString("hex"),

      delegatePopHex: automation.delegatePopHex,

      createSessionArgsXdr: [
        automation.policyInputXdrBase64,

        automation.delegatePopXdrBase64,
      ],

      sessionPolicyInput: automation.policyInput,

      /*
       * Useful for debugging the distinction between
       * scheduled runs and wallet authorizations.
       */
      scheduledRunLimit: automation.maxUses,

      sessionAuthorizationLimit: automation.policyInput.max_uses,

      payEndpoint: `/v1/automations/${id}/pay`,

      paymentPrepareEndpoint: `/v1/automations/${id}/payment/prepare`,

      paymentSettleEndpoint: `/v1/automations/${id}/payment/settle`,

      activateEndpoint: `/v1/automations/${id}/activate`,
    });
  } catch (error) {
    next(error);
  }
});

routes.post(
  "/v1/automations/:id/payment/prepare",
  async (request, response, next) => {
    try {
      const automation = await getAutomation(request.params.id);

      if (!automation) {
        return response.status(404).json({
          error: "Automation not found",
        });
      }

      const payerAddress = String(request.body?.payerAddress ?? "");

      if (!payerAddress) {
        return response.status(400).json({
          error: "payerAddress is required",
        });
      }

      const prepared = await preparePayment(automation, payerAddress);

      return response.status(201).json(prepared);
    } catch (error) {
      next(error);
    }
  },
);

routes.post(
  "/v1/automations/:id/payment/settle",
  async (request, response, next) => {
    try {
      const automation = await getAutomation(request.params.id);

      if (!automation) {
        return response.status(404).json({
          error: "Automation not found",
        });
      }

      if (automation.paymentStatus === "PAID") {
        return response.json({
          automationId: automation.id,

          paymentStatus: "PAID",

          transactionHash: automation.paymentTxHash,

          payer: automation.paymentPayer,
        });
      }

      const paymentSessionId = String(request.body?.paymentSessionId ?? "");

      const signedAuthEntriesXdr = request.body?.signedAuthEntriesXdr;

      if (!paymentSessionId || !Array.isArray(signedAuthEntriesXdr)) {
        return response.status(400).json({
          error: "paymentSessionId and signedAuthEntriesXdr are required",
        });
      }

      const settled = await settlePayment(
        automation,
        paymentSessionId,
        signedAuthEntriesXdr,
      );

      response.setHeader(
        "PAYMENT-RESPONSE",
        Buffer.from(JSON.stringify(settled)).toString("base64"),
      );

      return response.json(settled);
    } catch (error) {
      next(error);
    }
  },
);

/*
 * Backward-compatible discovery route.
 *
 * Payment settlement now uses:
 *   POST /payment/prepare
 *   POST /payment/settle
 */
routes.post("/v1/automations/:id/pay", async (request, response, next) => {
  try {
    const automation = await getAutomation(request.params.id);

    if (!automation) {
      return response.status(404).json({
        error: "Automation not found",
      });
    }

    if (automation.paymentStatus === "PAID") {
      return response.json({
        automationId: automation.id,

        paymentStatus: "PAID",

        transactionHash: automation.paymentTxHash,

        payer: automation.paymentPayer,
      });
    }

    return response.status(402).json({
      error: "Payment required",

      paymentRequirements: requirementsFor(automation),
    });
  } catch (error) {
    next(error);
  }
});

routes.post("/v1/automations/:id/activate", async (request, response, next) => {
  try {
    const input = activateSchema.parse(request.body);

    const automation = await getAutomation(request.params.id);

    if (!automation) {
      return response.status(404).json({
        error: "Automation not found",
      });
    }

    if (
      input.policyIdHex.toLowerCase() !==
      automation.expectedPolicyIdHex.toLowerCase()
    ) {
      return response.status(400).json({
        error: "policyIdHex mismatch",
      });
    }

    if (automation.paymentStatus !== "PAID") {
      return response.status(402).json({
        error: "Payment required",

        paymentRequirements: requirementsFor(automation),
      });
    }

    if (automation.status === "ACTIVE") {
      return response.json({
        automationId: automation.id,

        status: automation.status,

        policyIdHex: automation.onchainPolicyIdHex,

        agendaJobId: automation.agendaJobId,
      });
    }

    if (!["PAID", "PROPOSED"].includes(automation.status)) {
      return response.status(409).json({
        error: `Cannot activate from ${automation.status}`,
      });
    }

    const firstRunAt = new Date(input.firstRunAt);

    if (!Number.isFinite(firstRunAt.getTime())) {
      return response.status(400).json({
        error: "firstRunAt is invalid",
      });
    }

    const minimumFirstRunAt = Date.now() + 5_000;

    // if (firstRunAt.getTime() < minimumFirstRunAt) {
    //   return response.status(400).json({
    //     error: "firstRunAt must be at least 5 seconds in the future",
    //   });
    // }

    const jobId = await scheduleAutomation(
      automation.id,
      automation.schedule.kind,
      automation.schedule.expression,
      automation.schedule.timezone,
      firstRunAt,
      automation.maxUses,
    );

    await activateAutomation(
      automation.id,
      input.policyIdHex.toLowerCase(),
      input.transactionHash,
      jobId,
    );

    return response.json({
      automationId: automation.id,

      status: "ACTIVE",

      policyIdHex: input.policyIdHex.toLowerCase(),

      agendaJobId: jobId,
    });
  } catch (error) {
    next(error);
  }
});

routes.get("/v1/automations", async (request, response, next) => {
  try {
    const walletAddress = String(request.query.walletAddress ?? "").trim();
    const networkValue = String(request.query.network ?? "")
      .trim()
      .toUpperCase();

    if (!walletAddress) {
      return response.status(400).json({
        error: "walletAddress is required",
      });
    }

    if (
      networkValue &&
      networkValue !== "PUBLIC" &&
      networkValue !== "TESTNET"
    ) {
      return response.status(400).json({
        error: "network must be PUBLIC or TESTNET",
      });
    }

    const parsedLimit = Number(request.query.limit ?? 25);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 100)
      : 25;

    const cursorValue = String(request.query.cursor ?? "").trim();
    let cursor = null;

    if (cursorValue) {
      try {
        cursor = decodeAutomationCursor(cursorValue);
      } catch (error) {
        return response.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : "Invalid pagination cursor",
        });
      }
    }

    const network =
      networkValue === "PUBLIC" || networkValue === "TESTNET"
        ? networkValue
        : undefined;

    const page = await getAutomationsByWalletPage({
      walletAddress,
      ...(network !== undefined ? { network } : {}),
      limit,
      cursor,
    });

    const items = page.items.map(publicAutomation);

    return response.json({
      walletAddress,
      network: networkValue || null,
      count: items.length,
      limit,
      nextCursor: page.nextCursor,
      automations: items,
    });
  } catch (error) {
    next(error);
  }
});

routes.get("/v1/automations/:id", async (request, response, next) => {
  try {
    const automation = await getAutomation(request.params.id);

    if (!automation) {
      return response.status(404).json({
        error: "Automation not found",
      });
    }

    return response.json(publicAutomation(automation));
  } catch (error) {
    next(error);
  }
});

routes.post("/v1/automations/:id/pause", async (request, response, next) => {
  try {
    const automation = await getAutomation(request.params.id);

    if (!automation) {
      return response.status(404).json({
        error: "Automation not found",
      });
    }

    await cancelAutomationJob(automation.id);

    await setStatus(automation.id, "PAUSED");

    return response.json({
      id: automation.id,

      status: "PAUSED",
    });
  } catch (error) {
    next(error);
  }
});

routes.post("/v1/automations/:id/resume", async (request, response, next) => {
  try {
    const automation = await getAutomation(request.params.id);

    if (!automation) {
      return response.status(404).json({
        error: "Automation not found",
      });
    }

    if (!automation.onchainPolicyIdHex) {
      return response.status(409).json({
        error: "Not activated",
      });
    }

    if (automation.paymentStatus !== "PAID") {
      return response.status(402).json({
        error: "Payment required",

        paymentRequirements: requirementsFor(automation),
      });
    }

    if (automation.status === "REVOKED") {
      return response.status(409).json({
        error: "Revoked automation cannot be resumed",
      });
    }

    if (
      automation.maxUses !== null &&
      automation.runCount >= automation.maxUses
    ) {
      return response.status(409).json({
        error: "Automation reached its scheduled run limit",
      });
    }

    const resumeFirstRunAt = new Date(Date.now() + 10_000);

    const jobId = await scheduleAutomation(
      automation.id,
      automation.schedule.kind,
      automation.schedule.expression,
      automation.schedule.timezone,
      resumeFirstRunAt,
      automation.maxUses,
    );

    await setStatus(automation.id, "ACTIVE");

    return response.json({
      id: automation.id,

      status: "ACTIVE",

      agendaJobId: jobId,
    });
  } catch (error) {
    next(error);
  }
});

routes.post("/v1/automations/:id/cancel", async (request, response, next) => {
  try {
    const automation = await getAutomation(request.params.id);

    if (!automation) {
      return response.status(404).json({
        error: "Automation not found",
      });
    }

    if (automation.status === "REVOKED") {
      return response.json({
        id: automation.id,
        status: "REVOKED",
        state: "CANCELLED",
        cancelled: true,
      });
    }

    await cancelAutomationJob(automation.id);
    await setStatus(automation.id, "REVOKED");

    return response.json({
      id: automation.id,
      status: "REVOKED",
      state: "CANCELLED",
      cancelled: true,
      note: "AutoLayer scheduling is permanently cancelled. Revoke the wallet session on-chain separately when immediate delegated-key invalidation is required.",
    });
  } catch (error) {
    next(error);
  }
});

routes.post("/v1/automations/:id/revoke", async (request, response, next) => {
  try {
    const automation = await getAutomation(request.params.id);

    if (!automation) {
      return response.status(404).json({
        error: "Automation not found",
      });
    }

    await cancelAutomationJob(automation.id);

    await setStatus(automation.id, "REVOKED");

    return response.json({
      id: automation.id,

      status: "REVOKED",

      note: "Also revoke the delegated authorization on-chain.",
    });
  } catch (error) {
    next(error);
  }
});
