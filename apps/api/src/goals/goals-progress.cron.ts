import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { StoredGoal } from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { AuditRepository } from "../audit/audit.repository.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { LogEvent } from "../common/logging/events.js";
import { NotificationOutboxRepository } from "../notifications/notification-outbox.repository.js";
import { GoalRepository } from "./goal.repository.js";
import { GoalService } from "./goal.service.js";

type GoalsProgressLogger = Pick<Logger, "log" | "error">;

@Injectable()
export class GoalsProgressCron {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly config: RuntimeConfigService,
    private readonly goals: GoalRepository,
    private readonly goalService: GoalService,
    private readonly outbox: NotificationOutboxRepository,
    private readonly audit: AuditRepository,
    @Inject(Logger) private readonly logger: GoalsProgressLogger
  ) {}

  @Cron("5 2 * * *", { timeZone: "Asia/Kolkata" })
  async checkProgress(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    const active = await this.goals.findAllActive();
    let achievedCount = 0;
    for (const goal of active) {
      const achieved = await this.checkOne(goal).catch((error: unknown) => {
        this.logger.error(
          {
            event: LogEvent.GoalProgressCheckFailed,
            userId: goal.userId,
            goalId: goal.id,
            err: error
          },
          "goal progress check failed"
        );
        return false;
      });
      if (achieved) achievedCount += 1;
    }

    this.logger.log(
      {
        event: LogEvent.GoalsProgressChecked,
        activeCount: active.length,
        achievedCount
      },
      "goal progress checked"
    );
  }

  private async checkOne(candidate: StoredGoal): Promise<boolean> {
    const achieved = await withTxn(this.db, async (tx) => {
      const current = await this.goals.findById(candidate.userId, candidate.id, tx);
      if (current === null || current.status !== "active") return false;

      const progressMinor = await this.goalService.getProgress(candidate.userId, current, tx);
      if (progressMinor < current.targetMinor) return false;
      if (!(await this.goals.markAchieved(candidate.userId, current.id, tx))) return false;

      await this.outbox.enqueue(
        candidate.userId,
        "goal_achieved",
        { goalId: current.id, name: current.name, targetMinor: current.targetMinor },
        tx
      );
      await this.audit.record(candidate.userId, "goal.achieve", current.id, tx, {
        progressMinor,
        targetMinor: current.targetMinor
      });
      return true;
    });

    if (achieved) {
      this.logger.log(
        { event: LogEvent.GoalAchieved, userId: candidate.userId, goalId: candidate.id },
        "goal achieved"
      );
    }
    return achieved;
  }
}
