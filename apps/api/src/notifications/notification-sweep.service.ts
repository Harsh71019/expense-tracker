import { Inject, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import { NotificationOutboxRepository } from "./notification-outbox.repository.js";
import { NotificationsQueue } from "./notifications.queue.js";

const SWEEP_BATCH_SIZE = 100;

/**
 * BACKEND.md §14: "a worker drains the outbox with retries." This is the
 * draining trigger — it doesn't deliver anything itself, it just enqueues a
 * BullMQ job per still-pending entry so the real delivery attempt gets
 * BullMQ's retry/backoff/DLQ machinery. Registered once via AppModule
 * (shared by both the api and worker processes, per how NestJS's
 * ScheduleModule auto-discovers @Cron() providers across the whole graph),
 * but only actually acts when running as the worker — the api process's
 * copy of this cron is a deliberate no-op, exactly like startImportsWorker
 * is only ever invoked from worker.ts.
 */
@Injectable()
export class NotificationSweepService {
  constructor(
    private readonly config: RuntimeConfigService,
    private readonly outbox: NotificationOutboxRepository,
    private readonly queue: NotificationsQueue,
    @Inject(Logger) private readonly logger: Pick<Logger, "log">
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    const pending = await this.outbox.findPending(SWEEP_BATCH_SIZE);
    for (const entry of pending) {
      await this.queue.enqueueDelivery(entry.id);
    }
    if (pending.length > 0) {
      this.logger.log(
        { event: LogEvent.NotificationSweepEnqueued, count: pending.length },
        "notification sweep enqueued pending deliveries"
      );
    }
  }
}
