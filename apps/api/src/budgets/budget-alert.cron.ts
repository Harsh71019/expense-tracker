import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { Budget } from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { CategoryRepository } from "../categories/category.repository.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { LogEvent } from "../common/logging/events.js";
import { toISTMonth } from "../common/time/ist.js";
import { NotificationOutboxRepository } from "../notifications/notification-outbox.repository.js";
import {
  ALERT_POLICY_VERSION,
  ALERT_THRESHOLDS_BPS,
  computeUtilizationBps
} from "./budget-progress.js";
import { BudgetRepository } from "./budget.repository.js";

type BudgetAlertLogger = Pick<Logger, "log" | "error">;

/**
 * Daily worker-only reconciliation (design doc §9): unlike the generic
 * notification outbox+sweep+queue pipeline (which already delivers whatever
 * lands in notification_outbox, budget_alert included -- no dedicated queue
 * needed here), this cron is the thing that decides *whether* a budget_alert
 * belongs in the outbox at all, mirroring GoalsProgressCron's direct
 * per-entity withTxn + outbox.enqueue shape rather than the design doc's
 * originally-proposed separate BullMQ queue/processor (that infrastructure
 * already exists generically and would just be duplicated).
 */
@Injectable()
export class BudgetAlertCron {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly config: RuntimeConfigService,
    private readonly budgets: BudgetRepository,
    private readonly categories: CategoryRepository,
    private readonly outbox: NotificationOutboxRepository,
    @Inject(Logger) private readonly logger: BudgetAlertLogger
  ) {}

  @Cron("0 8 * * *", { timeZone: "Asia/Kolkata" })
  async checkThresholds(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    const active = await this.budgets.findAllActive();
    let alertedCount = 0;
    for (const budget of active) {
      const alerted = await this.checkOne(budget, new Date()).catch((error: unknown) => {
        this.logger.error(
          {
            event: LogEvent.BudgetAlertCheckFailed,
            userId: budget.userId,
            budgetId: budget.id,
            err: error
          },
          "budget alert check failed"
        );
        return false;
      });
      if (alerted) alertedCount += 1;
    }

    this.logger.log(
      { event: LogEvent.BudgetAlertsChecked, activeCount: active.length, alertedCount },
      "budget alert thresholds checked"
    );
  }

  private async checkOne(candidate: Budget, now: Date): Promise<boolean> {
    const alerted = await withTxn(this.db, async (tx) => {
      // Lock first: a concurrent pass over the same budget blocks here, then
      // (under read committed) re-reads the winner's committed alert-event
      // rows below instead of racing them.
      const budget = await this.budgets.lockActiveById(candidate.userId, candidate.id, tx);
      if (budget === null) return false;

      const category = await this.categories.findActiveById(budget.userId, budget.categoryId, tx);
      if (category === null) return false; // archived category => ineffective, no alert

      const month = toISTMonth(now);
      const spendByCategory = await this.budgets.categorySpendForMonth(budget.userId, month, tx);
      const spentMinor = spendByCategory.get(budget.categoryId) ?? 0;
      const utilizationBps = computeUtilizationBps(spentMinor, budget.limitMinor);
      const crossed = ALERT_THRESHOLDS_BPS.filter((threshold) => utilizationBps >= threshold);
      if (crossed.length === 0) return false;

      const recorded = await this.budgets.findRecordedThresholds(
        budget.userId,
        budget.id,
        month,
        ALERT_POLICY_VERSION,
        tx
      );
      const missing = crossed.filter((threshold) => !recorded.has(threshold));
      if (missing.length === 0) return false;

      for (const thresholdBps of missing) {
        await this.budgets.recordAlertEvent(
          {
            userId: budget.userId,
            budgetId: budget.id,
            month,
            policyVersion: ALERT_POLICY_VERSION,
            thresholdBps,
            spentMinor,
            limitMinor: budget.limitMinor
          },
          tx
        );
      }

      const highestNewThresholdBps = Math.max(...missing);
      await this.outbox.enqueue(
        budget.userId,
        "budget_alert",
        {
          budgetId: budget.id,
          categoryId: budget.categoryId,
          categoryName: category.name,
          month,
          thresholdBps: highestNewThresholdBps,
          spentMinor,
          limitMinor: budget.limitMinor
        },
        tx
      );
      return true;
    });

    if (alerted) {
      this.logger.log(
        { event: LogEvent.BudgetAlertEnqueued, userId: candidate.userId, budgetId: candidate.id },
        "budget alert enqueued"
      );
    }
    return alerted;
  }
}
