import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { AccountIdSchema, ColumnMappingSchema, ImportBatchIdSchema } from "@treasury-ops/shared";
import { Queue } from "bullmq";
import { z } from "zod";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { QUEUE_RETENTION } from "../common/queue/queue-policy.js";

export const IMPORTS_QUEUE_NAME = "imports";
export const PARSE_IMPORT_JOB_NAME = "parse";

export const ParseImportJobDataSchema = z.object({
  batchId: ImportBatchIdSchema,
  userId: z.string().min(1),
  accountId: AccountIdSchema,
  mapping: ColumnMappingSchema,
  /** Base64-encoded raw CSV bytes — see HANDOFF note in imports.processor.ts. */
  fileContentBase64: z.string().min(1),
  correlationId: z.string().min(1).max(128)
});

export type ParseImportJobData = z.infer<typeof ParseImportJobDataSchema>;
type ParseImportCommand = Omit<ParseImportJobData, "correlationId">;

@Injectable()
export class ImportsQueue implements OnModuleDestroy {
  private readonly queue: Queue<ParseImportJobData>;

  constructor(
    config: RuntimeConfigService,
    private readonly context: LoggingContextService = new LoggingContextService()
  ) {
    this.queue = new Queue<ParseImportJobData>(IMPORTS_QUEUE_NAME, {
      connection: createQueueConnection(config.env.REDIS_URL)
    });
  }

  /** Read-only access to the underlying Queue — Bull Board needs the real instance. */
  getQueue(): Queue<ParseImportJobData> {
    return this.queue;
  }

  async enqueueParse(data: ParseImportCommand): Promise<void> {
    const jobData = ParseImportJobDataSchema.parse({
      ...data,
      correlationId: this.context.get()?.reqId ?? crypto.randomUUID()
    });
    await this.queue.add(PARSE_IMPORT_JOB_NAME, jobData, {
      // One parse job per batch: a duplicate enqueue for the same batchId
      // (e.g. a retried HTTP request) is a no-op, not a second job.
      jobId: jobData.batchId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      ...QUEUE_RETENTION
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
