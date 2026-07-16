import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { LogEvent } from "../common/logging/events.js";
import type { DeliverNotificationJobData } from "./notifications.queue.js";
import { NOTIFICATIONS_QUEUE_NAME } from "./notifications.queue.js";
import { NotificationDeliveryService } from "./notification-delivery.service.js";

/**
 * Instantiated only by the worker process (worker.ts) — the API process
 * only ever enqueues via NotificationsQueue, mirroring imports.processor.ts.
 */
export function startNotificationsWorker(
  config: RuntimeConfigService,
  service: NotificationDeliveryService,
  logger: Pick<Logger, "log" | "error">
): Worker<DeliverNotificationJobData> {
  return new Worker<DeliverNotificationJobData>(
    NOTIFICATIONS_QUEUE_NAME,
    async (job: Job<DeliverNotificationJobData>) => {
      await service.deliver(job.data.notificationId);
      logger.log(
        { event: LogEvent.NotificationDelivered, notificationId: job.data.notificationId },
        "notification delivered"
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    logger.error(
      {
        event: LogEvent.NotificationDeliveryFailed,
        notificationId: job?.data.notificationId,
        err: error
      },
      "notification delivery failed"
    );
  });
}
