import { Agenda } from "agenda";
import { PostgresBackend } from "@agendajs/postgres-backend";

import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export const agenda = new Agenda({
  backend: new PostgresBackend({
    connectionString: env.DATABASE_URL,
  }),
  processEvery: env.AGENDA_PROCESS_EVERY,
  maxConcurrency: env.AGENDA_MAX_CONCURRENCY,
  defaultLockLifetime: env.JOB_LOCK_LIFETIME_MS,
  removeOnComplete: false,
  logging: true,
});

agenda.on("start", (job) => {
  logger.info(
    {
      jobName: job.attrs.name,
      jobId: String(job.attrs._id ?? ""),
      data: job.attrs.data,
      nextRunAt: job.attrs.nextRunAt,
      lastRunAt: job.attrs.lastRunAt,
    },
    "Agenda job started"
  );
});

agenda.on("complete", (job) => {
  logger.info(
    {
      jobName: job.attrs.name,
      jobId: String(job.attrs._id ?? ""),
      data: job.attrs.data,
      lastRunAt: job.attrs.lastRunAt,
      lastFinishedAt: job.attrs.lastFinishedAt,
      nextRunAt: job.attrs.nextRunAt,
    },
    "Agenda job completed"
  );
});

agenda.on("fail", (error, job) => {
  logger.error(
    {
      jobName: job.attrs.name,
      jobId: String(job.attrs._id ?? ""),
      data: job.attrs.data,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    },
    "Agenda job failed"
  );
});

agenda.on("error", (error) => {
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
    "Agenda emitted an error"
  );
});
