import { randomUUID } from "node:crypto";
import type { Job } from "agenda";

import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { executeAutomation } from "../services/execution.js";
import {
  clearAutomationNextRun,
  getAutomation,
  markAutomationRunStarted,
  runFailure,
  runSuccess,
  syncAutomationSchedule,
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

function validDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function defineAutomationJob(): void {
  agenda.define<AutomationJobData>(
    JOB_NAME,
    async (job: Job<AutomationJobData>) => {
      const automationId = job.attrs.data?.automationId;

      if (!automationId) {
        throw new Error("Agenda job is missing automationId");
      }

      const scheduledFor = validDate(job.attrs.lastRunAt) ?? new Date();
      const nextRunAt = validDate(job.attrs.nextRunAt);

      logger.info(
        {
          automationId,
          jobId: String(job.attrs._id ?? ""),
          lastRunAt: scheduledFor,
          nextRunAt,
        },
        "Automation job handler started"
      );

      const automation = await getAutomation(automationId);

      if (!automation) {
        logger.warn(
          { automationId },
          "Automation was not found; cancelling orphaned job"
        );
        await agenda.cancel({
          name: JOB_NAME,
          "data.automationId": automationId,
        } as never);
        return;
      }

      if (automation.status !== "ACTIVE") {
        await clearAutomationNextRun(automationId);
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

      await markAutomationRunStarted({
        id: automationId,
        lastRunAt: scheduledFor,
        nextRunAt,
      });

      const runId = randomUUID();
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
        const finishedAt = new Date();
        await pool.query(
          `UPDATE automations
              SET last_run_at=$2,
                  last_finished_at=$3,
                  next_run_at=$4,
                  updated_at=now()
            WHERE id=$1`,
          [automationId, scheduledFor, finishedAt, nextRunAt]
        );

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
        const finishedAt = new Date();

        await pool.query(
          `UPDATE automation_runs
           SET
             status='SUCCEEDED',
             transaction_hash=$2,
             response_json=$3,
             completed_at=$4
           WHERE id=$1`,
          [
            runId,
            output.transactionHash,
            JSON.stringify({
              ...output.response,
              transactionHashes: output.transactionHashes,
            }),
            finishedAt,
          ]
        );

        await runSuccess(automation.id, output.amount, output.transactionHash, {
          lastRunAt: scheduledFor,
          lastFinishedAt: finishedAt,
          nextRunAt,
        });

        const nextRunCount = automation.runCount + 1;
        if (automation.maxUses !== null && nextRunCount >= automation.maxUses) {
          await cancelAutomationJob(automationId);
        }

        logger.info(
          {
            automationId,
            runId,
            amount: output.amount,
            transactionHash: output.transactionHash,
            transactionHashes: output.transactionHashes,
            nextRunAt:
              automation.maxUses !== null && nextRunCount >= automation.maxUses
                ? null
                : nextRunAt,
          },
          "Automation run succeeded"
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const finishedAt = new Date();

        await pool.query(
          `UPDATE automation_runs
           SET
             status='FAILED',
             error=$2,
             completed_at=$3
           WHERE id=$1`,
          [runId, message.slice(0, 5000), finishedAt]
        );

        await runFailure(automation.id, message, {
          lastRunAt: scheduledFor,
          lastFinishedAt: finishedAt,
          nextRunAt,
        });

        logger.error(
          {
            automationId,
            runId,
            nextRunAt,
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
  await agenda.cancel({
    name: JOB_NAME,
    "data.automationId": automationId,
  } as never);

  if (!(firstRunAt instanceof Date) || !Number.isFinite(firstRunAt.getTime())) {
    throw new Error("firstRunAt must be a valid Date");
  }

  const now = Date.now();
  const resolvedFirstRunAt =
    firstRunAt.getTime() > now ? firstRunAt : new Date(now + 5_000);

  const job = agenda.create(JOB_NAME, { automationId });

  job.unique({
    name: JOB_NAME,
    "data.automationId": automationId,
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

  const nextRunAt = validDate(job.attrs.nextRunAt) ?? resolvedFirstRunAt;

  await syncAutomationSchedule(automationId, String(jobId), nextRunAt);

  logger.info(
    {
      automationId,
      jobId: String(jobId),
      kind,
      expression,
      timezone,
      maxUses,
      firstRunAt: resolvedFirstRunAt,
      nextRunAt,
    },
    "Automation scheduled"
  );

  return String(jobId);
}

export async function cancelAutomationJob(automationId: string): Promise<void> {
  const cancelled = await agenda.cancel({
    name: JOB_NAME,
    "data.automationId": automationId,
  } as never);

  await clearAutomationNextRun(automationId);

  logger.info({ automationId, cancelled }, "Automation job cancelled");
}
