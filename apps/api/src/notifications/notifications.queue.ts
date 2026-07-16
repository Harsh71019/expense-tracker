import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";

export const NOTIFICATIONS_QUEUE_NAME = "notifications";
export const DELIVER_NOTIFICATION_JOB_NAME = "deliver";

export type DeliverNotificationJobData = Readonly<{ notificationId: string }>;

@Injectable()
export class NotificationsQueue implements OnModuleDestroy {
  private readonly queue: Queue<DeliverNotificationJobData>;

  constructor(config: RuntimeConfigService) {
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
  async enqueueDelivery(notificationId: string): Promise<void> {
    await this.queue.add(
      DELIVER_NOTIFICATION_JOB_NAME,
      { notificationId },
      {
        jobId: notificationId,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 }
      }
    );
  }

  /** Read-only access to the underlying Queue — Bull Board needs the real instance. */
  getQueue(): Queue<DeliverNotificationJobData> {
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
