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
  notificationId: z.string().uuid(),
  userId: z.string().min(1),
  attemptGeneration: z.number().int().nonnegative(),
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
   * One job per durable attempt generation. Repeated sweeps of unchanged
   * state use the same id; a failed/released database attempt increments the
   * generation so a later sweep can enqueue recovery even if an older Bull
   * job remains terminal or delayed.
   */
  async enqueueDelivery(
    userId: string,
    notificationId: string,
    attemptCount: number
  ): Promise<void> {
    const data = DeliverNotificationJobDataSchema.parse({
      notificationId,
      userId,
      attemptGeneration: attemptCount,
      correlationId: this.context.get()?.reqId ?? crypto.randomUUID()
    });
    await this.queue.add(DELIVER_NOTIFICATION_JOB_NAME, data, {
      jobId: `${notificationId}-${data.attemptGeneration}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      ...QUEUE_RETENTION
    });
  }

  async replaceTerminalDelivery(
    userId: string,
    notificationId: string,
    attemptCount: number
  ): Promise<void> {
    const existing = await this.queue.getJob(`${notificationId}-${attemptCount}`);
    if (existing !== undefined) {
      const state = await existing.getState();
      if (state !== "completed" && state !== "failed") return;
      await existing.remove();
    }
    await this.enqueueDelivery(userId, notificationId, attemptCount);
  }

  /** Read-only access to the underlying Queue — Bull Board needs the real instance. */
  getQueue(): Queue<DeliverNotificationJobData> {
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
