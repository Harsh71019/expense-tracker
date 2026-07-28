import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import {
  DELIVER_NOTIFICATION_JOB_NAME,
  DeliverNotificationJobDataSchema,
  type DeliverNotificationJobData,
  NOTIFICATIONS_QUEUE_NAME
} from "./notifications.queue.js";
import { NotificationDeliveryService } from "./notification-delivery.service.js";

/**
 * Instantiated only by the worker process (worker.ts) — the API process
 * only ever enqueues via NotificationsQueue, mirroring imports.processor.ts.
 */
export function startNotificationsWorker(
  config: RuntimeConfigService,
  service: NotificationDeliveryService,
  logger: Pick<Logger, "log" | "error">,
  context: LoggingContextService = new LoggingContextService()
): Worker<DeliverNotificationJobData> {
  return new Worker<DeliverNotificationJobData>(
    NOTIFICATIONS_QUEUE_NAME,
    async (job: Job<DeliverNotificationJobData>) => {
      const startedAt = performance.now();
      const data = DeliverNotificationJobDataSchema.parse(job.data);
      return context.run(
        {
          reqId: data.correlationId,
          jobId: job.id ?? data.notificationId,
          jobName: job.name
        },
        async () => {
          await service.deliver(data.userId, data.notificationId);
          const durationMs = performance.now() - startedAt;
          logger.log(
            {
              event: LogEvent.NotificationDelivered,
              notificationId: data.notificationId,
              durationMs: Math.round(durationMs)
            },
            "notification delivered"
          );
        }
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    const data =
      job === undefined ? undefined : DeliverNotificationJobDataSchema.safeParse(job.data);
    logger.error(
      {
        event: LogEvent.NotificationDeliveryFailed,
        ...(job?.id === undefined ? {} : { jobId: job.id }),
        jobName: job?.name ?? DELIVER_NOTIFICATION_JOB_NAME,
        ...(data?.success === true
          ? {
              reqId: data.data.correlationId,
              notificationId: data.data.notificationId
            }
          : {}),
        err: error
      },
      "notification delivery failed"
    );
  });
}
