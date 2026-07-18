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
    // `::int`, not `::bigint` -- node-postgres returns bigint columns as
    // strings (JS numbers can't safely hold the full bigint range), which
    // silently turned `openingBalanceMinor + deltasByAccount.get(...)` into
    // string concatenation (e.g. "10000" + "-2000" -> "10000-2000") and
    // flagged every account with any transaction as drifted. Same `::int`
    // convention as MonthlyRollupRepository -- personal-finance amounts
    // never approach the int4 ceiling (~21.4M INR in paise).
    const rows = await this.db
      .select({
        accountId: transactions.accountId,
        netMinor: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end), 0)::int`
      })
      .from(transactions)
      .groupBy(transactions.accountId);
    return new Map(rows.map((row) => [row.accountId, row.netMinor]));
  }
}
