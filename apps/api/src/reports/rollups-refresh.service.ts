import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import { toISTMonth } from "../common/time/ist.js";
import { MonthlyRollupRepository } from "./monthly-rollup.repository.js";
import { previousMonth } from "./month.js";

type RollupsRefreshLogger = Pick<Logger, "log" | "error">;

/**
 * BACKEND.md §6 rollups.refresh (02:00 IST): recomputes current + previous
 * month for every user who has posted at least one transaction. Previous
 * month is included because late-posted/backdated transactions and
 * reversals can still land in a month whose cron run already passed —
 * recomputing it nightly keeps the cache converged without needing a
 * separate invalidation path. Worker-only guard mirrors
 * NotificationSweepService/RecurringMaterializeService.
 */
@Injectable()
export class RollupsRefreshService {
  constructor(
    private readonly config: RuntimeConfigService,
    private readonly rollups: MonthlyRollupRepository,
    @Inject(Logger) private readonly logger: RollupsRefreshLogger
  ) {}

  @Cron("0 2 * * *", { timeZone: "Asia/Kolkata" })
  async refresh(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    const currentMonth = toISTMonth(new Date());
    const lastMonth = previousMonth(currentMonth);
    const userIds = await this.rollups.distinctUserIds();

    for (const userId of userIds) {
      for (const month of [currentMonth, lastMonth]) {
        await this.rollups.recompute(userId, month).catch((error: unknown) => {
          this.logger.error(
            { event: LogEvent.RollupRefreshFailed, userId, month, err: error },
            "monthly rollup refresh failed"
          );
        });
      }
    }

    this.logger.log(
      {
        event: LogEvent.RollupsRefreshed,
        userCount: userIds.length,
        months: [currentMonth, lastMonth]
      },
      "monthly rollups refreshed"
    );
  }
}
