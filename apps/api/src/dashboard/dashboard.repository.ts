import { Inject, Injectable } from "@nestjs/common";
import type { CategoryRollup } from "@treasury-ops/shared";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { accounts, assets, assetValuations, transactions } from "../common/db/schema/index.js";

const IST_TIME_ZONE = "Asia/Kolkata";

export type DailyCashflow = Readonly<{ expenseMinor: number; incomeMinor: number }>;

@Injectable()
export class DashboardRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /**
   * Daily expense/income totals for `[from, to]`, keyed by IST calendar day
   * ("YYYY-MM-DD") -- the live, day-grained sibling of
   * MonthlyRollupRepository's month bucketing, for ranges shorter than a
   * month where the cached monthly rollup is too coarse.
   */
  async cashflowDaily(userId: string, from: Date, to: Date): Promise<Map<string, DailyCashflow>> {
    const istDay = sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE ${IST_TIME_ZONE}, 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        day: istDay,
        expenseMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        incomeMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          gte(transactions.occurredAt, from),
          lte(transactions.occurredAt, to)
        )
      )
      // Group by column position (1), not by re-embedding `istDay` a second
      // time: each embedding binds its own copy of IST_TIME_ZONE as a
      // separate query parameter, and Postgres's GROUP BY validity check
      // compares parameter nodes by identity, not by bound value -- two
      // textually-identical `to_char(...)` expressions with different
      // parameter ids are *not* recognized as the same grouping expression,
      // so `.groupBy(istDay)` here errors with "must appear in the GROUP BY
      // clause" even though the two expressions are semantically identical.
      .groupBy(sql`1`);

    return new Map(
      rows.map((row) => [
        row.day,
        { expenseMinor: Number(row.expenseMinor), incomeMinor: Number(row.incomeMinor) }
      ])
    );
  }

  /**
   * Category totals for `[from, to]` -- the live, arbitrary-date-range
   * sibling of MonthlyRollupRepository's byCategory query (which is bound
   * to one calendar month).
   */
  async categoryTotals(userId: string, from: Date, to: Date): Promise<CategoryRollup[]> {
    const rows = await this.db
      .select({
        categoryId: transactions.categoryId,
        spentMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        incomeMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        txnCount: sql<number>`count(*)::int`
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          gte(transactions.occurredAt, from),
          lte(transactions.occurredAt, to)
        )
      )
      .groupBy(transactions.categoryId);

    return rows.map((row) => ({
      ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
      spentMinor: Number(row.spentMinor),
      incomeMinor: Number(row.incomeMinor),
      txnCount: row.txnCount
    }));
  }

  /**
   * Historical account balances as of an instant, summed across every
   * account that existed by then -- opening balance + every transaction's
   * signed delta up to `asOf`, regardless of the transaction's current
   * status (mirrors BalanceVerifyRepository.sumDeltasByAccount: a reversal
   * never removes the original's contribution, it adds an opposite-signed
   * row of its own, so both must be summed to reconstruct history).
   */
  async accountsBalanceMinorAsOf(userId: string, asOf: Date): Promise<number> {
    const accountRows = await this.db
      .select({ id: accounts.id, openingBalanceMinor: accounts.openingBalanceMinor })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), lte(accounts.createdAt, asOf)));
    if (accountRows.length === 0) return 0;

    const accountIds = accountRows.map((row) => row.id);
    const deltaRows = await this.db
      .select({
        accountId: transactions.accountId,
        deltaMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end), 0)::bigint`
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.accountId, accountIds),
          lte(transactions.occurredAt, asOf)
        )
      )
      .groupBy(transactions.accountId);
    const deltaByAccount = new Map(deltaRows.map((row) => [row.accountId, Number(row.deltaMinor)]));

    return accountRows.reduce(
      (sum, account) => sum + account.openingBalanceMinor + (deltaByAccount.get(account.id) ?? 0),
      0
    );
  }

  /**
   * Historical asset value as of an instant, summed across every asset that
   * existed by then -- the latest valuation with `valuedAt <= asOf` per
   * asset (same in-memory-dedupe-over-one-ordered-query pattern as
   * ValuationRepository.findLatestForAssets, bounded to the past).
   */
  async assetsValueMinorAsOf(userId: string, asOf: Date): Promise<number> {
    const assetRows = await this.db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.userId, userId), lte(assets.openedAt, asOf)));
    if (assetRows.length === 0) return 0;

    const assetIds = assetRows.map((row) => row.id);
    const valuationRows = await this.db
      .select({
        assetId: assetValuations.assetId,
        valueMinor: assetValuations.valueMinor
      })
      .from(assetValuations)
      .where(
        and(
          eq(assetValuations.userId, userId),
          inArray(assetValuations.assetId, assetIds),
          lte(assetValuations.valuedAt, asOf)
        )
      )
      .orderBy(assetValuations.assetId, desc(assetValuations.valuedAt), desc(assetValuations.id));

    const latest = new Map<string, number>();
    for (const row of valuationRows) {
      if (latest.has(row.assetId)) continue;
      latest.set(row.assetId, row.valueMinor);
    }
    return [...latest.values()].reduce((sum, value) => sum + value, 0);
  }
}
