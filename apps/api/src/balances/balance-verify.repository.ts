import { Inject, Injectable } from "@nestjs/common";
import { AccountSchema, type Account } from "@vyaya/shared";
import { sql } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { accounts, transactions } from "../common/db/schema/index.js";

@Injectable()
export class BalanceVerifyRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /** Every account regardless of isArchived — an archived account's cached balance still has to be internally consistent. */
  async findAllAccounts(): Promise<Account[]> {
    const rows = await this.db.select().from(accounts);
    return rows.map((row) => AccountSchema.parse(row));
  }

  /**
   * Every transaction ever inserted for an account keeps contributing its
   * own original delta forever — a reversal never removes the original's
   * contribution, it adds an opposite-signed row of its own (see
   * TransactionService.reverse). Summing every row's signed amountMinor,
   * regardless of current status, reconstructs exactly what
   * applyBalanceDelta has cumulatively applied — so status is deliberately
   * not filtered here, unlike ExportService/MonthlyRollupRepository's
   * "posted" filter (those read *current* state, this reconstructs *history*).
   */
  async sumDeltasByAccount(): Promise<Map<string, number>> {
    // `::bigint`, not `::int` -- an `::int` SUM aggregate overflows past
    // ~2.1B paise (~21.4M INR) lifetime net on an account, well within the
    // Number.MAX_SAFE_INTEGER range amountMinor is declared valid up to
    // (packages/shared/src/account.ts), even though no single transaction
    // approaches it. node-postgres returns bigint/::bigint-cast columns as
    // JS strings (JS numbers can't safely hold the full bigint range) --
    // Number() the result explicitly below rather than letting
    // `openingBalanceMinor + deltasByAccount.get(...)` silently do string
    // concatenation (e.g. "10000" + "-2000" -> "10000-2000"), which is what
    // an un-widened `::int` avoided only by capping the range too low.
    const rows = await this.db
      .select({
        accountId: transactions.accountId,
        netMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end), 0)::bigint`
      })
      .from(transactions)
      .groupBy(transactions.accountId);
    return new Map(rows.map((row) => [row.accountId, Number(row.netMinor)]));
  }
}
