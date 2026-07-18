import { Inject, Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Cron } from "@nestjs/schedule";
import { computeNextOccurrence, type RecurringRule } from "@vyaya/shared";
import type { Connection } from "mongoose";
import { Logger } from "nestjs-pino";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn as withPgTxn } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { LogEvent } from "../common/logging/events.js";
import { withTxn as withMongoTxn } from "../common/mongo-txn.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import { parseExplicitDate } from "../common/time/parse-date.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { RecurringRuleRepository } from "./recurring-rule.repository.js";

type MaterializeLogger = Pick<Logger, "log" | "error">;

/**
 * BACKEND.md §6 `recurring.materialize` (01:00 IST): posts each due rule's
 * templated txn and advances nextRunAt. Registered once via AppModule (both
 * api and worker processes discover @Cron() providers), but only acts when
 * running as the worker — same SERVICE_ROLE-guarded no-op pattern as
 * NotificationSweepService.
 *
 * recurring_rules is still Mongo (Task 21 not done yet); accounts/
 * transactions/audit are Postgres (this task). Claim, post, and pause used
 * to be one atomic Mongo transaction -- can't be anymore, they're two
 * different databases. Split into three steps instead of one: claim (Mongo)
 * -> post (Postgres) -> pause (Mongo, only if the rrule is exhausted). If the
 * process crashes between claim and post, the rule's nextRunAt has already
 * advanced but nothing got posted -- a missed occurrence, not a duplicate
 * one. That ordering is deliberate: nothing here assigns the posted
 * transaction an idempotencyKey (it never did, even before this migration),
 * so claimRun's compare-and-swap is the only duplicate-post guard that
 * exists -- posting before claiming would risk a duplicate (double-charged
 * money data) on a crash-and-retry, which is worse than a missed one
 * (recoverable, and the whole point of `balances.verify`, Task 23, existing).
 * Resolved once recurring_rules is itself ported to Postgres and claim+post
 * can be one transaction again.
 */
@Injectable()
export class RecurringMaterializeService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
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
    const next = computeNextOccurrence(rule.rrule, rule.startAt, rule.nextRunAt);

    const claimed = await withMongoTxn(this.connection, (session) =>
      this.rules.claimRun(rule.userId, rule.id, rule.nextRunAt, next ?? rule.nextRunAt, session)
    );
    if (!claimed) return; // already materialized by a concurrent/retried run

    const posted = await withPgTxn(this.db, async (tx) => {
      const deltaMinor =
        rule.template.type === "income" ? rule.template.amountMinor : -rule.template.amountMinor;
      if (
        !(await this.accounts.applyBalanceDelta(
          rule.userId,
          rule.template.accountId,
          deltaMinor,
          tx
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
        tx,
        undefined,
        "recurring"
      );
      await this.audit.record(rule.userId, "recurring.materialize", posted.id, tx);
      return posted;
    });

    if (next === null) {
      await withMongoTxn(this.connection, (session) =>
        this.rules.pause(rule.userId, rule.id, session)
      );
    }

    this.logger.log(
      { event: LogEvent.RecurringMaterialized, ruleId: rule.id, txnId: posted.id },
      "recurring rule materialized"
    );
  }
}
