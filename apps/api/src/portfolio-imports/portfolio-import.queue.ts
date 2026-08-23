import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PortfolioImportBatchIdSchema } from "@treasury-ops/shared";
import { Queue } from "bullmq";
import { z } from "zod";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { QUEUE_RETENTION } from "../common/queue/queue-policy.js";

export const PORTFOLIO_IMPORTS_QUEUE_NAME = "portfolio-imports";

export const PortfolioImportJobDataSchema = z.object({
  batchId: PortfolioImportBatchIdSchema,
  userId: z.string().min(1),
  correlationId: z.string().min(1)
});

export type PortfolioImportJobData = z.infer<typeof PortfolioImportJobDataSchema>;

@Injectable()
export class PortfolioImportsQueue implements OnModuleDestroy {
  private readonly queue: Queue<PortfolioImportJobData>;

  constructor(config: RuntimeConfigService) {
    this.queue = new Queue<PortfolioImportJobData>(PORTFOLIO_IMPORTS_QUEUE_NAME, {
      connection: createQueueConnection(config.env.REDIS_URL)
    });
  }

  getQueue(): Queue<PortfolioImportJobData> {
    return this.queue;
  }

  async enqueue(data: PortfolioImportJobData): Promise<void> {
    const parsed = PortfolioImportJobDataSchema.parse(data);
    await this.queue.add("parse_cas", parsed, {
      jobId: `portfolio_import_${parsed.batchId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      ...QUEUE_RETENTION
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
