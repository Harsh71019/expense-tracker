import { Inject, Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Cron } from "@nestjs/schedule";
import { computeNextOccurrence, type RecurringRule } from "@vyaya/shared";
import type { Connection } from "mongoose";
import { Logger } from "nestjs-pino";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { LogEvent } from "../common/logging/events.js";
import { withTxn } from "../common/mongo-txn.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import { parseExplicitDate } from "../common/time/parse-date.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { RecurringRuleRepository } from "./recurring-rule.repository.js";

type MaterializeLogger = Pick<Logger, "log" | "error">;

/**
 * BACKEND.md §6 `recurring.materialize` (01:00 IST): posts each due rule's
 * templated txn in its own transaction and advances nextRunAt in the same
 * txn. Registered once via AppModule (both api and worker processes discover
 * @Cron() providers), but only acts when running as the worker — same
 * SERVICE_ROLE-guarded no-op pattern as NotificationSweepService.
 */
@Injectable()
export class RecurringMaterializeService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: RuntimeConfigService,
    private readonly rules: RecurringRuleRepository,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
    private readonly audit: AuditRepository,
    @Inject(Logger) private readonly logger: MaterializeLogger
  ) {}

  @Cron("0 1 * * *", { timeZone: "Asia/Kolkata" })
  async materialize(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

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
  }

  private async materializeOne(rule: RecurringRule): Promise<void> {
    const created = await withTxn(this.connection, async (session) => {
      const next = computeNextOccurrence(rule.rrule, rule.startAt, rule.nextRunAt);
      const claimed = await this.rules.claimRun(
        rule.userId,
        rule.id,
        rule.nextRunAt,
        next ?? rule.nextRunAt,
        session
      );
      if (!claimed) return null; // already materialized by a concurrent/retried run

      const deltaMinor =
        rule.template.type === "income" ? rule.template.amountMinor : -rule.template.amountMinor;
      if (
        !(await this.accounts.applyBalanceDelta(
          rule.userId,
          rule.template.accountId,
          deltaMinor,
          session
        ))
      ) {
        throw new EntityNotFoundError("Account");
      }

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
        session,
        undefined,
        "recurring"
      );
      await this.audit.record(rule.userId, "recurring.materialize", posted.id, session);

      if (next === null) {
        await this.rules.pause(rule.userId, rule.id, session);
      }

      return posted;
    });

    if (created === null) return;
    this.logger.log(
      { event: LogEvent.RecurringMaterialized, ruleId: rule.id, txnId: created.id },
      "recurring rule materialized"
    );
  }
}
