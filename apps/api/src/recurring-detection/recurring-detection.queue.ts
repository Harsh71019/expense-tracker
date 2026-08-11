import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { z } from "zod";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { QUEUE_RETENTION } from "../common/queue/queue-policy.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import { RECURRING_DETECTOR_VERSION } from "./recurring-detection.constants.js";

export const RECURRING_DETECTION_QUEUE_NAME = "recurring-detection";
export const ANALYZE_RECURRING_USER_JOB_NAME = "analyze-user";

export const RecurringDetectionJobDataSchema = z
  .object({
    userId: z.string().min(1),
    asOf: z.iso.datetime({ offset: true }),
    detectorVersion: z.number().int().positive(),
    correlationId: z.string().min(1).max(128)
  })
  .readonly();
export type RecurringDetectionJobData = z.infer<typeof RecurringDetectionJobDataSchema>;

@Injectable()
export class RecurringDetectionQueue implements OnModuleDestroy {
  private readonly queue: Queue<RecurringDetectionJobData>;

  constructor(
    config: RuntimeConfigService,
    private readonly context: LoggingContextService = new LoggingContextService()
  ) {
    this.queue = new Queue<RecurringDetectionJobData>(RECURRING_DETECTION_QUEUE_NAME, {
      connection: createQueueConnection(config.env.REDIS_URL)
    });
  }

  async enqueueAnalysis(userId: string, asOf: Date): Promise<void> {
    const data = RecurringDetectionJobDataSchema.parse({
      userId,
      asOf: asOf.toISOString(),
      detectorVersion: RECURRING_DETECTOR_VERSION,
      correlationId: this.context.get()?.reqId ?? crypto.randomUUID()
    });
    await this.queue.add(ANALYZE_RECURRING_USER_JOB_NAME, data, {
      jobId: `${userId}:${toISTCalendarDate(asOf)}:v${RECURRING_DETECTOR_VERSION}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      ...QUEUE_RETENTION
    });
  }

  getQueue(): Queue<RecurringDetectionJobData> {
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
