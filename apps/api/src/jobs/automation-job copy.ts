import { randomUUID } from "node:crypto";
import type { Job } from "agenda";

import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { executeAutomation } from "../services/execution.js";
import {
  getAutomation,
  runFailure,
  runSuccess,
} from "../services/repository.js";
import { logger } from "../utils/logger.js";
import { agenda } from "./agenda.js";

const JOB_NAME = "autolayer:automation:execute";

interface AutomationJobData {
  automationId: string;
}

function toErrorDetails(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

export function defineAutomationJob(): void {
  agenda.define<AutomationJobData>(
    JOB_NAME,
    async (job: Job<AutomationJobData>) => {
      const automationId = job.attrs.data?.automationId;

      if (!automationId) {
        throw new Error("Agenda job is missing automationId");
      }

      logger.info(
        {
          automationId,
          jobId: String(job.attrs._id ?? ""),
          lastRunAt: job.attrs.lastRunAt,
          nextRunAt: job.attrs.nextRunAt,
        },
        "Automation job handler started"
      );

      const automation = await getAutomation(automationId);

      if (!automation) {
        logger.warn({ automationId }, "Automation was not found; skipping job");
        return;
      }

      if (automation.status !== "ACTIVE") {
        logger.info(
          { automationId, status: automation.status },
          "Automation is not active; skipping job"
        );
        return;
      }

      if (
        automation.maxUses !== null &&
        automation.runCount >= automation.maxUses
      ) {
        logger.info(
          {
            automationId,
            runCount: automation.runCount,
            maxUses: automation.maxUses,
          },
          "Automation reached its run limit; cancelling job"
        );
        await cancelAutomationJob(automationId);
        return;
      }

      const runId = randomUUID();
      const scheduledFor = job.attrs.lastRunAt ?? new Date();
      const idempotencyKey = `${automation.id}:${scheduledFor.toISOString()}`;

      const inserted = await pool.query(
        `INSERT INTO automation_runs(
          id,
          automation_id,
          idempotency_key,
          status,
          scheduled_for
        )
        VALUES($1,$2,$3,'STARTED',$4)
        ON CONFLICT(idempotency_key) DO NOTHING
        RETURNING id`,
        [runId, automation.id, idempotencyKey, scheduledFor]
      );

      if (!inserted.rowCount) {
        logger.info(
          { automationId, runId, idempotencyKey },
          "Duplicate automation run skipped"
        );
        return;
      }

      logger.info(
        {
          automationId,
          runId,
          idempotencyKey,
          executionMode: env.EXECUTION_MODE,
        },
        "Automation execution started"
      );

      try {
        const output = await executeAutomation(automation, runId);

        await pool.query(
          `UPDATE automation_runs
           SET
             status='SUCCEEDED',
             transaction_hash=$2,
             response_json=$3,
             completed_at=now()
           WHERE id=$1`,
          [
            runId,
            output.transactionHash,
            JSON.stringify({
              executionStatus: output.status,
              ...output.response,
              transactionHashes: output.transactionHashes,
            }),
          ]
        );

        if (output.status === "SKIPPED") {
          logger.info(
            {
              automationId,
              runId,
              reason: output.response.skipped?.reason,
              rebalance: output.response.skipped?.rebalance,
            },
            "Automation check completed without submitting a transaction"
          );
          return;
        }

        await runSuccess(automation.id, output.amount, output.transactionHash);

        logger.info(
          {
            automationId,
            runId,
            amount: output.amount,
            transactionHash: output.transactionHash,
            transactionHashes: output.transactionHashes,
          },
          "Automation run succeeded"
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        await pool.query(
          `UPDATE automation_runs
           SET
             status='FAILED',
             error=$2,
             completed_at=now()
           WHERE id=$1`,
          [runId, message.slice(0, 5000)]
        );

        await runFailure(automation.id, message);

        logger.error(
          {
            automationId,
            runId,
            error: toErrorDetails(error),
          },
          "Automation run failed"
        );

        throw error;
      }
    },
    {
      concurrency: 5,
      lockLifetime: env.JOB_LOCK_LIFETIME_MS,
    }
  );
}

export const defineDcaJob = defineAutomationJob;

export async function scheduleAutomation(
  automationId: string,
  kind: "INTERVAL" | "CRON",
  expression: string,
  timezone: string,
  firstRunAt: Date,
  maxUses: number | null
): Promise<string> {
  const cancelled = await agenda.cancel({
    name: JOB_NAME,
    data: {
      automationId,
    },
  });

  logger.info(
    {
      automationId,
      cancelled,
    },
    "Existing jobs for automation cleared"
  );

  if (!(firstRunAt instanceof Date) || !Number.isFinite(firstRunAt.getTime())) {
    throw new Error("firstRunAt must be a valid Date");
  }

  const now = Date.now();

  const resolvedFirstRunAt =
    firstRunAt.getTime() > now ? firstRunAt : new Date(now + 5_000);

  const job = agenda.create(JOB_NAME, {
    automationId,
  });

  job.unique({
    name: JOB_NAME,
    data: {
      automationId,
    },
  });

  if (maxUses === 1) {
    job.schedule(resolvedFirstRunAt);
  } else {
    job.repeatEvery(expression, {
      timezone,
      skipImmediate: true,
    });

    job.schedule(resolvedFirstRunAt);
  }

  await job.save();

  const jobId = job.attrs._id;

  if (!jobId) {
    throw new Error("Agenda did not return a job ID");
  }

  logger.info(
    {
      automationId,
      jobId: String(jobId),
      kind,
      expression,
      timezone,
      maxUses,
      firstRunAt: resolvedFirstRunAt,
      nextRunAt: job.attrs.nextRunAt,
    },
    "Automation scheduled"
  );

  return String(jobId);
}

export async function cancelAutomationJob(automationId: string): Promise<void> {
  const cancelled = await agenda.cancel({
    name: JOB_NAME,
    data: {
      automationId,
    },
  });

  logger.info(
    {
      automationId,
      cancelled,
    },
    "Automation job cancelled"
  );
}
