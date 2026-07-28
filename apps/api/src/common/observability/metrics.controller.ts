import { Controller, Get, Header } from "@nestjs/common";

import { ImportsQueue, IMPORTS_QUEUE_NAME } from "../../imports/imports.queue.js";
import {
  NotificationsQueue,
  NOTIFICATIONS_QUEUE_NAME
} from "../../notifications/notifications.queue.js";
import {
  SpendingWarningsQueue,
  SPENDING_WARNINGS_QUEUE_NAME
} from "../../spending-warnings/spending-warnings.queue.js";
import { RedisService } from "../redis/redis.service.js";
import { MetricsService, type QueueMetricSnapshot } from "./metrics.service.js";

const JOB_STATES = ["waiting", "active", "delayed", "failed"] as const;

@Controller("v1/metrics")
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly redis: RedisService,
    private readonly imports: ImportsQueue,
    private readonly notifications: NotificationsQueue,
    private readonly spendingWarnings: SpendingWarningsQueue
  ) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async getMetrics(): Promise<string> {
    const [queues, workerHeartbeatAgeSeconds, balanceVerification] = await Promise.all([
      this.queueSnapshots(),
      this.redis.workerHeartbeatAgeSeconds(),
      this.metrics.readBalanceVerification()
    ]);
    return this.metrics.render(queues, workerHeartbeatAgeSeconds, balanceVerification);
  }

  private async queueSnapshots(): Promise<QueueMetricSnapshot[]> {
    const [imports, notifications, spendingWarnings] = await Promise.all([
      this.imports.getQueue().getJobCounts(...JOB_STATES),
      this.notifications.getQueue().getJobCounts(...JOB_STATES),
      this.spendingWarnings.getQueue().getJobCounts(...JOB_STATES)
    ]);
    return [
      { queue: IMPORTS_QUEUE_NAME, counts: imports },
      { queue: NOTIFICATIONS_QUEUE_NAME, counts: notifications },
      { queue: SPENDING_WARNINGS_QUEUE_NAME, counts: spendingWarnings }
    ];
  }
}
