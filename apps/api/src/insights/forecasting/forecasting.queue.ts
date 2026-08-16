import type { OnModuleDestroy } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { z } from "zod";

import { RuntimeConfigService } from "../../common/config/runtime-config.service.js";
import { createQueueConnection } from "../../common/queue/queue-connection.js";
import { QUEUE_RETENTION } from "../../common/queue/queue-policy.js";
import { toISTCalendarDate } from "../../common/time/ist.js";
import { CASHFLOW_FORECAST_VERSION } from "./forecasting.constants.js";

export const CASHFLOW_FORECAST_QUEUE_NAME = "cashflow-forecast";
export const COMPUTE_CASHFLOW_FORECAST_JOB_NAME = "compute-user";
export const CashflowForecastJobDataSchema = z
  .object({
    userId: z.string().min(1),
    asOf: z.iso.datetime({ offset: true }),
    modelVersion: z.number().int().positive(),
    correlationId: z.string().min(1).max(128)
  })
  .readonly();
export type CashflowForecastJobData = z.infer<typeof CashflowForecastJobDataSchema>;
@Injectable()
export class ForecastingQueue implements OnModuleDestroy {
  private readonly queue: Queue<CashflowForecastJobData>;
  constructor(config: RuntimeConfigService) {
    this.queue = new Queue(CASHFLOW_FORECAST_QUEUE_NAME, {
      connection: createQueueConnection(config.env.REDIS_URL)
    });
  }
  async enqueue(userId: string, asOf: Date): Promise<void> {
    const data = CashflowForecastJobDataSchema.parse({
      userId,
      asOf: asOf.toISOString(),
      modelVersion: CASHFLOW_FORECAST_VERSION,
      correlationId: crypto.randomUUID()
    });
    await this.queue.add(COMPUTE_CASHFLOW_FORECAST_JOB_NAME, data, {
      jobId: `${userId}:${toISTCalendarDate(asOf)}:v${CASHFLOW_FORECAST_VERSION}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      ...QUEUE_RETENTION
    });
  }
  getQueue(): Queue<CashflowForecastJobData> {
    return this.queue;
  }
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
