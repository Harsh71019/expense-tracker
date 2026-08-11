import { Inject, Injectable, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import {
  runScheduled,
  ScheduledRunCoordinator
} from "../common/scheduler/scheduled-run.coordinator.js";
import { RECURRING_DETECTION_DISCOVERY_BATCH_SIZE } from "./recurring-detection.constants.js";
import { RecurringDetectionQueue } from "./recurring-detection.queue.js";
import { RecurringDetectionRepository } from "./recurring-detection.repository.js";

@Injectable()
export class RecurringDetectionScheduleService {
  constructor(
    private readonly config: RuntimeConfigService,
    private readonly repository: RecurringDetectionRepository,
    private readonly queue: RecurringDetectionQueue,
    @Inject(Logger) private readonly logger: Pick<Logger, "log">,
    @Optional() private readonly scheduler?: ScheduledRunCoordinator
  ) {}

  @Cron("30 4 * * *", { timeZone: "Asia/Kolkata" })
  async enqueueDailyAnalysis(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;
    await runScheduled(this.scheduler, "recurring_detection.schedule", "daily", async () => {
      const asOf = new Date();
      const userIds = await this.repository.systemFindUsersNeedingRefresh(
        asOf,
        RECURRING_DETECTION_DISCOVERY_BATCH_SIZE
      );
      for (const userId of userIds) {
        await this.queue.enqueueAnalysis(userId, asOf);
      }
      this.logger.log(
        { event: LogEvent.RecurringDetectionScheduled, userCount: userIds.length },
        "recurring detection shadow jobs scheduled"
      );
      return userIds.length;
    });
  }
}
