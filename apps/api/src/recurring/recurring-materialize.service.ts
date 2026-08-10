import { Inject, Injectable, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { computeNextOccurrence, type RecurringRule } from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { AccountRepository } from "../accounts/account.repository.js";
import { assertBalanceDeltaApplied } from "../accounts/balance-delta.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { LogEvent } from "../common/logging/events.js";
import {
  runScheduled,
  ScheduledRunCoordinator
} from "../common/scheduler/scheduled-run.coordinator.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import { parseExplicitDate } from "../common/time/parse-date.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { RecurringOccurrenceRepository } from "./recurring-occurrence.repository.js";
import { RecurringRuleRepository } from "./recurring-rule.repository.js";

type MaterializeLogger = Pick<Logger, "log" | "error">;

/**
 * BACKEND.md §6 `recurring.materialize` (01:00 IST): posts each due rule's
 * templated txn and advances nextRunAt. Registered once via AppModule (both
 * api and worker processes discover @Cron() providers), but only acts when
 * running as the worker — same SERVICE_ROLE-guarded no-op pattern as
 * NotificationSweepService.
 *
 * Claim (CAS on nextRunAt + isPaused, with pause folded into the same
 * statement — see claimRun) and post are one atomic Postgres transaction —
 * recurring_rules/accounts/transactions/audit_log are all Postgres now
 * (Task 21), so there's no cross-database split needed here anymore. Still
 * no idempotencyKey on the posted transaction (never had one, even before
 * this migration) — claimRun's compare-and-swap remains the only
 * duplicate-post guard, which is why it still runs first, inside the same
 * transaction as the post it guards.
 */
@Injectable()
export class RecurringMaterializeService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly config: RuntimeConfigService,
    private readonly rules: RecurringRuleRepository,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
    private readonly occurrences: RecurringOccurrenceRepository,
    private readonly audit: AuditRepository,
    @Inject(Logger) private readonly logger: MaterializeLogger,
    @Optional() private readonly scheduler?: ScheduledRunCoordinator
  ) {}

  @Cron("0 1 * * *", { timeZone: "Asia/Kolkata" })
  async materialize(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    await runScheduled(this.scheduler, "recurring.materialize", "daily", async () => {
      const today = parseExplicitDate(toISTCalendarDate(new Date()), "YYYY-MM-DD");
      const due = await this.rules.findDue(today);
      for (const rule of due) {
        await this.materializeOne(rule).catch((error: unknown) => {
          this.logger.error(
            { event: LogEvent.RecurringMaterializeFailed, ruleId: rule.id, err: error },
            "recurring rule materialization failed"
          );
        });
      }
      return due.length;
    });
  }

  private async materializeOne(rule: RecurringRule): Promise<void> {
    const next = computeNextOccurrence(rule.rrule, rule.startAt, rule.nextRunAt);

    const result = await withTxn(this.db, async (tx) => {
      const claimed = await this.rules.claimRun(
        rule.userId,
        rule.id,
        rule.nextRunAt,
        next ?? rule.nextRunAt,
        next === null,
        tx
      );
      if (!claimed) return null; // already materialized by a concurrent/retried run

      if (!rule.autoPost) {
        const occurrence = await this.occurrences.createExpected(
          rule.userId,
          rule.id,
          rule.nextRunAt,
          tx
        );
        await this.audit.record(rule.userId, "recurring.occurrence.expected", occurrence.id, tx);
        return { kind: "occurrence" as const, occurrenceId: occurrence.id };
      }

      const deltaMinor =
        rule.template.type === "income" ? rule.template.amountMinor : -rule.template.amountMinor;
      assertBalanceDeltaApplied(
        await this.accounts.applyBalanceDelta(rule.userId, rule.template.accountId, deltaMinor, tx)
      );

      const posted = await this.transactions.create(
        rule.userId,
        {
          accountId: rule.template.accountId,
          categoryId: rule.template.categoryId,
          type: rule.template.type,
          amountMinor: rule.template.amountMinor,
          occurredAt: rule.nextRunAt,
          description: rule.template.description,
          tags: rule.template.tags
        },
        undefined,
        tx,
        undefined,
        "recurring",
        undefined,
        rule.id
      );
      await this.audit.record(rule.userId, "recurring.materialize", posted.id, tx);

      return { kind: "transaction" as const, txnId: posted.id };
    });

    if (result === null) return;

    if (result.kind === "occurrence") {
      this.logger.log(
        {
          event: LogEvent.RecurringOccurrenceExpected,
          ruleId: rule.id,
          occurrenceId: result.occurrenceId
        },
        "recurring occurrence expected (manual post)"
      );
      return;
    }

    this.logger.log(
      { event: LogEvent.RecurringMaterialized, ruleId: rule.id, txnId: result.txnId },
      "recurring rule materialized"
    );
  }
}
