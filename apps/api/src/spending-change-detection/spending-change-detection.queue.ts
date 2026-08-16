import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { z } from "zod";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { QUEUE_RETENTION } from "../common/queue/queue-policy.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import {
  DETECTOR_VERSION,
  SPENDING_CHANGE_JOB_NAME,
  SPENDING_CHANGE_QUEUE_NAME
} from "./spending-change-detection.constants.js";

export { SPENDING_CHANGE_JOB_NAME, SPENDING_CHANGE_QUEUE_NAME };

export const SpendingChangeJobDataSchema = z
  .object({
    userId: z.string().min(1),
    asOf: z.iso.datetime({ offset: true }),
    detectorVersion: z.number().int().positive(),
    correlationId: z.string().min(1).max(128)
  })
  .readonly();
export type SpendingChangeJobData = z.infer<typeof SpendingChangeJobDataSchema>;

@Injectable()
export class SpendingChangeDetectionQueue implements OnModuleDestroy {
  private readonly queue: Queue<SpendingChangeJobData>;

  constructor(
    config: RuntimeConfigService,
    private readonly context: LoggingContextService = new LoggingContextService()
  ) {
    this.queue = new Queue<SpendingChangeJobData>(SPENDING_CHANGE_QUEUE_NAME, {
      connection: createQueueConnection(config.env.REDIS_URL)
    });
  }

  async enqueueAnalysis(userId: string, asOf: Date): Promise<void> {
    const data = SpendingChangeJobDataSchema.parse({
      userId,
      asOf: asOf.toISOString(),
      detectorVersion: DETECTOR_VERSION,
      correlationId: this.context.get()?.reqId ?? crypto.randomUUID()
    });
    await this.queue.add(SPENDING_CHANGE_JOB_NAME, data, {
      jobId: `${userId}:${toISTCalendarDate(asOf)}:v${DETECTOR_VERSION}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      ...QUEUE_RETENTION
    });
  }

  getQueue(): Queue<SpendingChangeJobData> {
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
