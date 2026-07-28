import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { z } from "zod";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { QUEUE_RETENTION } from "../common/queue/queue-policy.js";

export const NOTIFICATIONS_QUEUE_NAME = "notifications";
export const DELIVER_NOTIFICATION_JOB_NAME = "deliver";

export const DeliverNotificationJobDataSchema = z.object({
  userId: z.string().min(1),
  notificationId: z.string().uuid(),
  correlationId: z.string().min(1).max(128)
});

export type DeliverNotificationJobData = z.infer<typeof DeliverNotificationJobDataSchema>;

@Injectable()
export class NotificationsQueue implements OnModuleDestroy {
  private readonly queue: Queue<DeliverNotificationJobData>;

  constructor(
    config: RuntimeConfigService,
    private readonly context: LoggingContextService = new LoggingContextService()
  ) {
    this.queue = new Queue<DeliverNotificationJobData>(NOTIFICATIONS_QUEUE_NAME, {
      connection: createQueueConnection(config.env.REDIS_URL)
    });
  }

  /**
   * One delivery job per outbox entry (jobId = notificationId): the sweep
   * re-scans "pending" entries on every tick, so re-enqueueing the same
   * entry while its job is still active/waiting/delayed is a safe no-op —
   * BullMQ dedupes on jobId for jobs that haven't reached a terminal state.
   */
  async enqueueDelivery(userId: string, notificationId: string): Promise<void> {
    const data = DeliverNotificationJobDataSchema.parse({
      userId,
      notificationId,
      correlationId: this.context.get()?.reqId ?? crypto.randomUUID()
    });
    await this.queue.add(DELIVER_NOTIFICATION_JOB_NAME, data, {
      jobId: notificationId,
      attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      ...QUEUE_RETENTION
    });
  }

  async replaceTerminalDelivery(userId: string, notificationId: string): Promise<void> {
    const existing = await this.queue.getJob(notificationId);
    if (existing !== undefined) {
      const state = await existing.getState();
      if (state !== "completed" && state !== "failed") return;
      await existing.remove();
    }
    await this.enqueueDelivery(userId, notificationId);
  }

  /** Read-only access to the underlying Queue — Bull Board needs the real instance. */
  getQueue(): Queue<DeliverNotificationJobData> {
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
