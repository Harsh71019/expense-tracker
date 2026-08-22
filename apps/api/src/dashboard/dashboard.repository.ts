import { Inject, Injectable } from "@nestjs/common";
import type { CategoryRollup } from "@treasury-ops/shared";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import {
  accounts,
  assetFundings,
  assets,
  assetValuations,
  receivableEvents,
  receivables,
  transactions
} from "../common/db/schema/index.js";
import { isActiveAssetFunding } from "../common/db/asset-funding-active.js";

const IST_TIME_ZONE = "Asia/Kolkata";

export type DailyCashflow = Readonly<{ expenseMinor: number; incomeMinor: number }>;
export type DailyConsumption = Readonly<{ expenseMinor: number }>;

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
    // Deliberately unfiltered by purpose/asset-funding, like
    // MonthlyRollupRepository's totalExpenseMinor/totalIncomeMinor: this
    // feeds getCashflow's short-range branch, whose long-range branch reads
    // those same raw monthly-rollup totals -- switching chart ranges must
    // not change what counts as cashflow. `consumptionDaily` below is the
    // spend-classification sibling.
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

  /** Daily consumption totals exclude transfer legs and active asset fundings. */
  async consumptionDaily(
    userId: string,
    from: Date,
    to: Date
  ): Promise<Map<string, DailyConsumption>> {
    const istDay = sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE ${IST_TIME_ZONE}, 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        day: istDay,
        expenseMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' and ${transactions.transferGroupId} is null and ${assetFundings.id} is null then ${transactions.amountMinor} else 0 end), 0)::bigint`
      })
      .from(transactions)
      .leftJoin(
        assetFundings,
        and(
          eq(assetFundings.userId, userId),
          eq(assetFundings.transactionId, transactions.id),
          isActiveAssetFunding()
        )
      )
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          eq(transactions.purpose, "ordinary"),
          gte(transactions.occurredAt, from),
          lte(transactions.occurredAt, to)
        )
      )
      .groupBy(sql`1`);
    return new Map(rows.map((row) => [row.day, { expenseMinor: Number(row.expenseMinor) }]));
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
        spentMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' and ${transactions.transferGroupId} is null and ${assetFundings.id} is null then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        incomeMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        txnCount: sql<number>`count(*) filter (where ${transactions.type} = 'income' or (${transactions.type} = 'expense' and ${transactions.transferGroupId} is null and ${assetFundings.id} is null))::int`
      })
      .from(transactions)
      .leftJoin(
        assetFundings,
        and(
          eq(assetFundings.userId, userId),
          eq(assetFundings.transactionId, transactions.id),
          isActiveAssetFunding()
        )
      )
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          eq(transactions.purpose, "ordinary"),
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
    // Once a legacy `loan_receivable` asset has been backfilled into the
    // receivables sub-ledger (plan doc §13), its historical value comes from
    // `receivablesOutstandingMinorAsOf` instead -- excluded here so a
    // migrated asset is never counted twice.
    const assetRows = await this.db
      .select({ id: assets.id })
      .from(assets)
      .where(
        and(
          eq(assets.userId, userId),
          lte(assets.openedAt, asOf),
          sql`not exists (select 1 from ${receivables} where ${receivables.legacyAssetId} = ${assets.id})`
        )
      );
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

  /**
   * Historical receivables outstanding as of an instant -- effective-signed
   * events (plan doc §8): a transactionless (opening-balance/correction/
   * legacy) event contributes from its own `occurredAt`; a transaction-backed
   * event contributes from `occurredAt` until its linked transaction's
   * reversal `occurredAt`, if any, has passed `asOf`.
   */
  async receivablesOutstandingMinorAsOf(userId: string, asOf: Date): Promise<number> {
    const reversalTxn = alias(transactions, "reversal_txn");
    const increaseKinds = sql`${receivableEvents.kind} in ('opening', 'correction_increase', 'legacy_increase')`;
    const decreaseKinds = sql`${receivableEvents.kind} in ('repayment', 'correction_decrease', 'legacy_decrease')`;
    const effectiveAtAsOf = sql`(${receivableEvents.transactionId} is null or ${reversalTxn.id} is null or ${reversalTxn.occurredAt} > ${asOf})`;

    const [row] = await this.db
      .select({
        outstandingMinor: sql<string>`coalesce(sum(case
          when ${effectiveAtAsOf} and ${increaseKinds} then ${receivableEvents.amountMinor}
          when ${effectiveAtAsOf} and ${decreaseKinds} then -${receivableEvents.amountMinor}
          else 0 end), 0)::bigint`
      })
      .from(receivableEvents)
      .leftJoin(transactions, eq(receivableEvents.transactionId, transactions.id))
      .leftJoin(reversalTxn, eq(transactions.reversedBy, reversalTxn.id))
      .where(and(eq(receivableEvents.userId, userId), lte(receivableEvents.occurredAt, asOf)));

    return row === undefined ? 0 : Number(row.outstandingMinor);
  }
}
