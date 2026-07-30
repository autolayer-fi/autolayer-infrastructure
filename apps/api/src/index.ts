import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { routes } from "./api/routes.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { agenda } from "./jobs/agenda.js";
import { defineAutomationJob } from "./jobs/automation-job.js";
import { logger } from "./utils/logger.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json({ limit: "256kb" }));
app.use(pinoHttp({ logger }));
app.use(routes);

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
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
      "request failed"
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
  }
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
    "Agenda automation worker started"
  );

  app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        executionMode: env.EXECUTION_MODE,
      },
      "AutoLayer listening"
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
    "startup failed"
  );

  process.exit(1);
});
