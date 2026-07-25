import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { addUtcCalendarDays, computeCreditCardCycle, type Account } from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { LogEvent } from "../common/logging/events.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import { parseExplicitDate } from "../common/time/parse-date.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { CreditCardBillRepository } from "./credit-card-bill.repository.js";

type BillGenerationLogger = Pick<Logger, "log" | "error">;

@Injectable()
export class BillGenerationCron {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly config: RuntimeConfigService,
    private readonly accounts: AccountRepository,
    private readonly bills: CreditCardBillRepository,
    private readonly transactions: TransactionRepository,
    private readonly audit: AuditRepository,
    @Inject(Logger) private readonly logger: BillGenerationLogger
  ) {}

  @Cron("15 1 * * *", { timeZone: "Asia/Kolkata" })
  async generate(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;
    const today = parseExplicitDate(toISTCalendarDate(new Date()), "YYYY-MM-DD");
    const dueCards = await this.accounts.findDueCreditCards(today);
    for (const account of dueCards) {
      await this.generateOne(account).catch((error: unknown) => {
        this.logger.error(
          { event: LogEvent.CreditCardBillGenerationFailed, accountId: account.id, err: error },
          "credit-card bill generation failed"
        );
      });
    }
  }

  async generateOne(account: Account): Promise<void> {
    const config = account.creditCardConfig;
    if (account.type !== "credit_card" || config === undefined) return;
    const cycle = computeCreditCardCycle(
      config.statementDay,
      config.dueDay,
      config.nextStatementAt
    );
    const created = await withTxn(this.db, async (tx) => {
      const claimed = await this.accounts.claimStatementCycle(
        account.userId,
        account.id,
        config.nextStatementAt,
        cycle.nextStatementAt,
        tx
      );
      if (!claimed) return null;
      const amountDueMinor = await this.transactions.summarizeBillableCycle(
        account.userId,
        account.id,
        cycle.cycleStart,
        addUtcCalendarDays(cycle.cycleEnd, 1),
        tx
      );
      const bill = await this.bills.create(
        account.userId,
        {
          accountId: account.id,
          cycleStart: cycle.cycleStart,
          cycleEnd: cycle.cycleEnd,
          dueDate: cycle.dueDate,
          amountDueMinor
        },
        tx
      );
      await this.audit.record(account.userId, "credit-card.bill.generate", bill.id, tx, {
        accountId: account.id,
        cycleEnd: cycle.cycleEnd.toISOString()
      });
      return bill;
    });
    if (created === null) return;
    this.logger.log(
      {
        event: LogEvent.CreditCardBillGenerated,
        billId: created.id,
        accountId: created.accountId
      },
      "credit-card bill generated"
    );
  }
}
