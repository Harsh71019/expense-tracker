import { Inject, Injectable } from "@nestjs/common";
import {
  MONTHLY_ROLLUP_FORMULA_VERSION,
  MonthlyRollupSchema,
  parseSafeIntegerMinor,
  type Month,
  type MonthlyRollup
} from "@treasury-ops/shared";
import { and, eq, gte, lt, sql } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { assetFundings, monthlyRollups, transactions } from "../common/db/schema/index.js";
import { isActiveAssetFunding } from "../common/db/asset-funding-active.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";

const IST_TIME_ZONE = "Asia/Kolkata";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MonthlyRollupRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /**
   * Three separate GROUP BY queries replace Mongo's single $facet — Postgres
   * has no facet-in-one-pass verb, and three indexed scans over the same
   * userId+month-bounded row set is cheap at personal-finance scale (same
   * "recomputed fully, never incremental" design as the Mongo version).
   * Month bucketing uses Postgres's `to_char(... AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`
   * — same reasoning as the original: manual transactions carry a real
   * time-of-day, so the IST month can differ from the UTC month.
   */
  async recompute(userId: string, month: Month): Promise<MonthlyRollup> {
    return withTxn(this.db, (tx) => this.recomputeInTx(userId, month, tx));
  }

  private async recomputeInTx(userId: string, month: Month, tx: DbTx): Promise<MonthlyRollup> {
    await this.lockMonth(userId, month, tx);
    const { roughStart, roughEnd } = roughMonthBounds(month);
    const istMonth = sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE ${IST_TIME_ZONE}, 'YYYY-MM')`;
    const baseWhere = and(
      eq(transactions.userId, userId),
      eq(transactions.status, "posted"),
      gte(transactions.occurredAt, roughStart),
      lt(transactions.occurredAt, roughEnd),
      sql`${istMonth} = ${month}`
    );
    // `byCategory`/`totalExpenseMinor`/`totalIncomeMinor`/`totalCashOutflowMinor`
    // stay on unfiltered `baseWhere` -- like DashboardRepository's
    // `accountsBalanceMinorAsOf` and `byAccount.netMinor` below, they report
    // real cash movement ("CASH OUT: all account outflows" in the UI), not a
    // spend/earned classification. `consumptionExpense` is the one true
    // spend-classification expression (feeds `consumptionByCategory` /
    // `totalConsumptionMinor`, what the reports UI actually renders as
    // "spend"), so it excludes both active asset-funding legs and receivable
    // principal (plan doc §12/ADR-DG-003) -- balance-sheet movement, not
    // consumption.
    const consumptionExpense = sql`case when ${transactions.type} = 'expense' and ${transactions.transferGroupId} is null and ${assetFundings.id} is null and ${transactions.purpose} = 'ordinary' then ${transactions.amountMinor} else 0 end`;

    // `::bigint`, not `::int` -- amountMinor is declared valid up to
    // Number.MAX_SAFE_INTEGER (packages/shared/src/transaction.ts), and a
    // SUM aggregate over many rows can exceed int4's ~2.1B ceiling (~21.4M
    // INR in paise) well within that declared range, even though no single
    // row does. node-postgres returns bigint/::bigint-cast columns as JS
    // strings (see BalanceVerifyRepository.sumDeltasByAccount) -- Number()
    // each aggregate explicitly below; these sums stay far under
    // Number.MAX_SAFE_INTEGER at personal-finance scale, so the conversion
    // is lossless.
    const byCategoryRows = await tx
      .select({
        categoryId: transactions.categoryId,
        spentMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        incomeMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        txnCount: sql<number>`count(*)::int`
      })
      .from(transactions)
      .where(baseWhere)
      .groupBy(transactions.categoryId);

    const consumptionByCategoryRows = await tx
      .select({
        categoryId: transactions.categoryId,
        spentMinor: sql<string>`coalesce(sum(${consumptionExpense}), 0)::bigint`,
        incomeMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        txnCount: sql<number>`count(*) filter (where ${transactions.type} = 'income' or (${transactions.type} = 'expense' and ${transactions.transferGroupId} is null and ${assetFundings.id} is null and ${transactions.purpose} = 'ordinary'))::int`
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
      .where(baseWhere)
      .groupBy(transactions.categoryId);

    const byAccountRows = await tx
      .select({
        accountId: transactions.accountId,
        netMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end), 0)::bigint`
      })
      .from(transactions)
      .where(baseWhere)
      .groupBy(transactions.accountId);

    const [totalsRow] = await tx
      .select({
        totalExpenseMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        totalIncomeMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        totalConsumptionMinor: sql<string>`coalesce(sum(${consumptionExpense}), 0)::bigint`,
        totalAssetFundingMinor: sql<string>`coalesce(sum(case when ${assetFundings.id} is not null then ${assetFundings.amountMinor} else 0 end), 0)::bigint`
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
      .where(baseWhere);

    const document = {
      userId,
      month,
      byCategory: byCategoryRows.map((row) => ({
        ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
        spentMinor: parseSafeIntegerMinor(row.spentMinor),
        incomeMinor: parseSafeIntegerMinor(row.incomeMinor),
        txnCount: row.txnCount
      })),
      byAccount: byAccountRows.map((row) => ({
        accountId: row.accountId,
        netMinor: parseSafeIntegerMinor(row.netMinor)
      })),
      totalExpenseMinor: parseSafeIntegerMinor(totalsRow?.totalExpenseMinor ?? 0),
      totalIncomeMinor: parseSafeIntegerMinor(totalsRow?.totalIncomeMinor ?? 0),
      totalCashOutflowMinor: parseSafeIntegerMinor(totalsRow?.totalExpenseMinor ?? 0),
      totalConsumptionMinor: parseSafeIntegerMinor(totalsRow?.totalConsumptionMinor ?? 0),
      totalAssetFundingMinor: parseSafeIntegerMinor(totalsRow?.totalAssetFundingMinor ?? 0),
      consumptionByCategory: consumptionByCategoryRows.map((row) => ({
        ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
        spentMinor: parseSafeIntegerMinor(row.spentMinor),
        incomeMinor: parseSafeIntegerMinor(row.incomeMinor),
        txnCount: row.txnCount
      })),
      formulaVersion: MONTHLY_ROLLUP_FORMULA_VERSION,
      computedAt: new Date()
    };

    await tx
      .insert(monthlyRollups)
      .values(document)
      .onConflictDoUpdate({
        target: [monthlyRollups.userId, monthlyRollups.month],
        set: {
          byCategory: document.byCategory,
          byAccount: document.byAccount,
          totalExpenseMinor: document.totalExpenseMinor,
          totalIncomeMinor: document.totalIncomeMinor,
          totalCashOutflowMinor: document.totalCashOutflowMinor,
          totalConsumptionMinor: document.totalConsumptionMinor,
          totalAssetFundingMinor: document.totalAssetFundingMinor,
          consumptionByCategory: document.consumptionByCategory,
          formulaVersion: document.formulaVersion,
          computedAt: document.computedAt
        }
      });

    return MonthlyRollupSchema.parse(document);
  }

  async findByMonth(userId: string, month: Month): Promise<MonthlyRollup | null> {
    const [row] = await this.db
      .select()
      .from(monthlyRollups)
      .where(and(eq(monthlyRollups.userId, userId), eq(monthlyRollups.month, month)));
    return row === undefined ? null : MonthlyRollupSchema.parse(stripNulls(row));
  }

  async invalidate(userId: string, month: Month, tx: DbTx): Promise<void> {
    await this.lockMonth(userId, month, tx);
    await tx
      .delete(monthlyRollups)
      .where(and(eq(monthlyRollups.userId, userId), eq(monthlyRollups.month, month)));
  }

  /**
   * Serializes cache reads/recomputations with the transaction that invalidates
   * the same user/month. It is transaction-scoped, so lock release coincides
   * with publishing the cache row or committing the ledger/funding mutation.
   */
  private async lockMonth(userId: string, month: Month, tx: DbTx): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${month}`}, 0))`
    );
  }

  async distinctUserIds(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ userId: transactions.userId })
      .from(transactions)
      .where(eq(transactions.status, "posted"));
    return rows.map((row) => row.userId);
  }
}

function roughMonthBounds(month: Month): { roughStart: Date; roughEnd: Date } {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  return {
    roughStart: new Date(Date.UTC(year, monthIndex, 1) - ONE_DAY_MS),
    roughEnd: new Date(Date.UTC(year, monthIndex + 1, 1) + ONE_DAY_MS)
  };
}
