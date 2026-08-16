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
import {
  RecurringDetectionQueue,
  RECURRING_DETECTION_QUEUE_NAME
} from "../../recurring-detection/recurring-detection.queue.js";
import {
  SpendingChangeDetectionQueue,
  SPENDING_CHANGE_QUEUE_NAME
} from "../../spending-change-detection/spending-change-detection.queue.js";
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
    private readonly spendingWarnings: SpendingWarningsQueue,
    private readonly recurringDetection: RecurringDetectionQueue,
    private readonly spendingChange: SpendingChangeDetectionQueue
  ) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async getMetrics(): Promise<string> {
    const [
      queues,
      workerHeartbeatAgeSeconds,
      balanceVerification,
      recurringDetection,
      spendingChangeDetection
    ] = await Promise.all([
      this.queueSnapshots(),
      this.redis.workerHeartbeatAgeSeconds(),
      this.metrics.readBalanceVerification(),
      this.metrics.readRecurringDetectionMetrics(),
      this.metrics.readSpendingChangeDetectionMetrics()
    ]);
    return this.metrics.render(
      queues,
      workerHeartbeatAgeSeconds,
      balanceVerification,
      new Date(),
      recurringDetection,
      spendingChangeDetection
    );
  }

  private async queueSnapshots(): Promise<QueueMetricSnapshot[]> {
    const [imports, notifications, spendingWarnings, recurringDetection, spendingChange] =
      await Promise.all([
        this.imports.getQueue().getJobCounts(...JOB_STATES),
        this.notifications.getQueue().getJobCounts(...JOB_STATES),
        this.spendingWarnings.getQueue().getJobCounts(...JOB_STATES),
        this.recurringDetection.getQueue().getJobCounts(...JOB_STATES),
        this.spendingChange.getQueue().getJobCounts(...JOB_STATES)
      ]);
    return [
      { queue: IMPORTS_QUEUE_NAME, counts: imports },
      { queue: NOTIFICATIONS_QUEUE_NAME, counts: notifications },
      { queue: SPENDING_WARNINGS_QUEUE_NAME, counts: spendingWarnings },
      { queue: RECURRING_DETECTION_QUEUE_NAME, counts: recurringDetection },
      { queue: SPENDING_CHANGE_QUEUE_NAME, counts: spendingChange }
    ];
  }
}
