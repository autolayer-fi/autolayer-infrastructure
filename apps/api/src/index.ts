import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { routes } from "./api/routes.js";
import { skillsRoutes } from "./api/skills.routes.js";
import { mcpRoutes } from "./api/mcp.routes.js";
import { gatewayRoutes } from "./api/gateway.routes.js";
import { authRoutes } from "./api/auth.routes.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { agenda } from "./jobs/agenda.js";
import { defineAutomationJob } from "./jobs/automation-job.js";
import { logger } from "./utils/logger.js";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactStellarScheme as ExactStellarServerScheme } from "@x402/stellar/exact/server";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";
import { facilitator } from "./services/x402-facilitator.js";
import type { SupportedResponse } from "@x402/core/types";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));
app.use("/gateway", express.raw({ type: "*/*", limit: "10mb" }));
app.use(express.json({ limit: "256kb" }));
app.use(pinoHttp({ logger }));
const facilitatorClient = {
  getSupported: async () => facilitator.getSupported() as SupportedResponse,
  verify: facilitator.verify.bind(facilitator),
  settle: facilitator.settle.bind(facilitator),
};
const paidResourceServer = new x402ResourceServer(facilitatorClient)
  .register("stellar:testnet", new ExactStellarServerScheme())
  .register("stellar:pubnet", new ExactStellarServerScheme())
  .registerExtension(bazaarResourceServerExtension);
app.use(
  paymentMiddleware(
    {
      "GET /examples/protocol-spec": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.01",
            network: "stellar:testnet",
            payTo: env.TREASURY_G_ACCOUNT,
          },
          {
            scheme: "exact",
            price: "$0.01",
            network: "stellar:pubnet",
            payTo: env.TREASURY_G_ACCOUNT,
          },
        ],
        description:
          "Machine-readable Stellar payment and Soroban invocation specification for autonomous software.",
        mimeType: "application/json",
        extensions: declareDiscoveryExtension({
          input: { protocol: "stellar-payment" },
          inputSchema: {
            properties: {
              protocol: {
                type: "string",
                description: "Financial protocol or action to inspect",
              },
            },
            required: [],
          },
          output: {
            example: {
              protocol: "stellar-payment",
              actions: ["pay"],
              networks: ["stellar:testnet", "stellar:pubnet"],
            },
          },
        }),
      },
    },
    paidResourceServer,
    undefined,
    undefined,
    false,
  ),
);
app.get("/examples/protocol-spec", (_request, response) =>
  response.json({
    protocol: "stellar-payment",
    summary: "Transfer XLM or SEP-41 assets without constructing XDR.",
    actions: {
      pay: {
        input: {
          destination: "Stellar address",
          asset: "native or contract address",
          amount: "decimal string",
          network: "stellar:testnet or stellar:pubnet",
        },
        requiresWalletAuthorization: true,
      },
    },
  }),
);
app.use(routes);
app.use(skillsRoutes);
app.use(mcpRoutes);
app.use(authRoutes);
app.use(gatewayRoutes);

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error(
      {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
      },
      "request failed",
    );

    const message =
      error instanceof Error ? error.message : "Internal server error";

    const normalized = message.toLowerCase();
    const statusCode = normalized.includes("not found")
      ? 404
      : normalized.includes("expired") || normalized.includes("invalid")
        ? 400
        : 500;

    response.status(statusCode).json({ error: message });
  },
);

async function start(): Promise<void> {
  await pool.query("SELECT 1");

  // Register handlers before starting Agenda.
  defineAutomationJob();
  await agenda.start();

  logger.info(
    {
      processEvery: env.AGENDA_PROCESS_EVERY,
      maxConcurrency: env.AGENDA_MAX_CONCURRENCY,
      executionMode: env.EXECUTION_MODE,
    },
    "Agenda automation worker started",
  );

  app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        executionMode: env.EXECUTION_MODE,
      },
      "AutoLayer listening",
    );
  });
}

async function stop(signal: string): Promise<void> {
  logger.info({ signal }, "AutoLayer shutdown started");

  try {
    await agenda.stop();
  } catch (error) {
    logger.error({ error }, "Failed to stop Agenda cleanly");
  }

  try {
    await pool.end();
  } catch (error) {
    logger.error({ error }, "Failed to close PostgreSQL pool cleanly");
  }

  logger.info("AutoLayer shutdown completed");
  process.exit(0);
}

process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));

start().catch((error) => {
  logger.fatal(
    {
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    },
    "startup failed",
  );

  process.exit(1);
});
