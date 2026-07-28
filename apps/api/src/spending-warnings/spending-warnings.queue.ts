import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { z } from "zod";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { QUEUE_RETENTION } from "../common/queue/queue-policy.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import { DETECTOR_VERSION } from "./spending-warnings.detector.js";

export const SPENDING_WARNINGS_QUEUE_NAME = "spending-warnings";
export const ANALYZE_USER_JOB_NAME = "analyze";

export const AnalyzeUserJobDataSchema = z.object({
  userId: z.string().min(1),
  /** ISO instant — the single fixed `asOf` every detector in this run shares (plan §4). */
  asOf: z.iso.datetime({ offset: true }),
  detectorVersion: z.number().int().positive(),
  correlationId: z.string().min(1).max(128)
});

export type AnalyzeUserJobData = z.infer<typeof AnalyzeUserJobDataSchema>;

@Injectable()
export class SpendingWarningsQueue implements OnModuleDestroy {
  private readonly queue: Queue<AnalyzeUserJobData>;

  constructor(
    config: RuntimeConfigService,
    private readonly context: LoggingContextService = new LoggingContextService()
  ) {
    this.queue = new Queue<AnalyzeUserJobData>(SPENDING_WARNINGS_QUEUE_NAME, {
      connection: createQueueConnection(config.env.REDIS_URL)
    });
  }

  /**
   * One job per user per IST calendar day per detector version (plan §8):
   * `jobId` is deterministic, so a retried cron tick or a duplicate
   * schedule invocation is a safe no-op rather than a second analysis run.
   */
  async enqueueAnalysis(userId: string, asOf: Date): Promise<void> {
    const data = AnalyzeUserJobDataSchema.parse({
      userId,
      asOf: asOf.toISOString(),
      detectorVersion: DETECTOR_VERSION,
      correlationId: this.context.get()?.reqId ?? crypto.randomUUID()
    });
    await this.queue.add(ANALYZE_USER_JOB_NAME, data, {
      jobId: `${userId}:${toISTCalendarDate(asOf)}:v${DETECTOR_VERSION}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      ...QUEUE_RETENTION
    });
  }

  /** Read-only access to the underlying Queue — Bull Board needs the real instance. */
  getQueue(): Queue<AnalyzeUserJobData> {
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
