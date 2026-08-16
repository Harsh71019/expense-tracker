import { Inject, Injectable, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import {
  runScheduled,
  ScheduledRunCoordinator
} from "../common/scheduler/scheduled-run.coordinator.js";
import { SPENDING_CHANGE_DISCOVERY_BATCH_SIZE } from "./spending-change-detection.constants.js";
import { SpendingChangeDetectionQueue } from "./spending-change-detection.queue.js";
import { SpendingChangeDetectionRepository } from "./spending-change-detection.repository.js";

@Injectable()
export class SpendingChangeDetectionScheduleService {
  constructor(
    private readonly config: RuntimeConfigService,
    private readonly repository: SpendingChangeDetectionRepository,
    private readonly queue: SpendingChangeDetectionQueue,
    @Inject(Logger) private readonly logger: Pick<Logger, "log">,
    @Optional() private readonly scheduler?: ScheduledRunCoordinator
  ) {}

  @Cron("45 4 * * *", { timeZone: "Asia/Kolkata" })
  async enqueueDailyAnalysis(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;
    await runScheduled(this.scheduler, "spending_change.schedule", "daily", async () => {
      const asOf = new Date();
      const userIds = await this.repository.systemFindUsersNeedingRefresh(
        asOf,
        SPENDING_CHANGE_DISCOVERY_BATCH_SIZE
      );
      for (const userId of userIds) {
        await this.queue.enqueueAnalysis(userId, asOf);
      }
      this.logger.log(
        { event: LogEvent.SpendingChangeScheduled, userCount: userIds.length },
        "spending change detection shadow jobs scheduled"
      );
      return userIds.length;
    });
  }
}
