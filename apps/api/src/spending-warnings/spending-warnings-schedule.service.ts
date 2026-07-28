import { Inject, Injectable, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import {
  runScheduled,
  ScheduledRunCoordinator
} from "../common/scheduler/scheduled-run.coordinator.js";
import { MonthlyRollupRepository } from "../reports/monthly-rollup.repository.js";
import { SpendingWarningsQueue } from "./spending-warnings.queue.js";

type ScheduleLogger = Pick<Logger, "log">;

/**
 * Daily 05:00 IST cron (plan §8), enqueuing one analysis job per user.
 * Reuses `MonthlyRollupRepository.distinctUserIds()` (the existing
 * posted-transaction user discovery path) rather than adding a second
 * unscoped repository method for the same purpose. Registered once via
 * AppModule (both api and worker processes discover @Cron() providers),
 * but only acts when running as the worker — the same SERVICE_ROLE-guarded
 * no-op pattern as RollupsRefreshService/RecurringMaterializeService.
 */
@Injectable()
export class SpendingWarningsScheduleService {
  constructor(
    private readonly config: RuntimeConfigService,
    private readonly rollups: MonthlyRollupRepository,
    private readonly queue: SpendingWarningsQueue,
    @Inject(Logger) private readonly logger: ScheduleLogger,
    @Optional() private readonly scheduler?: ScheduledRunCoordinator
  ) {}

  @Cron("0 5 * * *", { timeZone: "Asia/Kolkata" })
  async enqueueDailyAnalysis(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    await runScheduled(this.scheduler, "spending_warnings.schedule", "daily", async () => {
      const asOf = new Date();
      const userIds = await this.rollups.distinctUserIds();
      for (const userId of userIds) {
        await this.queue.enqueueAnalysis(userId, asOf);
      }

      this.logger.log(
        { event: LogEvent.SpendingWarningsScheduled, userCount: userIds.length },
        "spending warnings analysis scheduled"
      );
      return userIds.length;
    });
  }
}
