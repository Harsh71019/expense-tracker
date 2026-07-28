import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { QUEUE_RETENTION } from "../common/queue/queue-policy.js";
import { ImportWorkflowJobDataSchema, type ImportWorkflowJobData } from "./import-workflow.js";

export const IMPORTS_QUEUE_NAME = "imports";

@Injectable()
export class ImportsQueue implements OnModuleDestroy {
  private readonly queue: Queue<ImportWorkflowJobData>;

  constructor(config: RuntimeConfigService) {
    this.queue = new Queue<ImportWorkflowJobData>(IMPORTS_QUEUE_NAME, {
      connection: createQueueConnection(config.env.REDIS_URL)
    });
  }

  getQueue(): Queue<ImportWorkflowJobData> {
    return this.queue;
  }

  async enqueueWorkflow(command: ImportWorkflowJobData): Promise<void> {
    const data = ImportWorkflowJobDataSchema.parse(command);
    await this.queue.add(data.operation, data, {
      jobId: data.claimToken,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      ...QUEUE_RETENTION
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
