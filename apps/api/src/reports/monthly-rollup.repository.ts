import { Inject, Injectable } from "@nestjs/common";
import { MonthlyRollupSchema, type Month, type MonthlyRollup } from "@treasury-ops/shared";
import { and, eq, gte, lt, sql } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { monthlyRollups, transactions } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";

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
    const { roughStart, roughEnd } = roughMonthBounds(month);
    const istMonth = sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE ${IST_TIME_ZONE}, 'YYYY-MM')`;
    const baseWhere = and(
      eq(transactions.userId, userId),
      eq(transactions.status, "posted"),
      gte(transactions.occurredAt, roughStart),
      lt(transactions.occurredAt, roughEnd),
      sql`${istMonth} = ${month}`
    );

    // `::bigint`, not `::int` -- amountMinor is declared valid up to
    // Number.MAX_SAFE_INTEGER (packages/shared/src/transaction.ts), and a
    // SUM aggregate over many rows can exceed int4's ~2.1B ceiling (~21.4M
    // INR in paise) well within that declared range, even though no single
    // row does. node-postgres returns bigint/::bigint-cast columns as JS
    // strings (see BalanceVerifyRepository.sumDeltasByAccount) -- Number()
    // each aggregate explicitly below; these sums stay far under
    // Number.MAX_SAFE_INTEGER at personal-finance scale, so the conversion
    // is lossless.
    const byCategoryRows = await this.db
      .select({
        categoryId: transactions.categoryId,
        spentMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        incomeMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        txnCount: sql<number>`count(*)::int`
      })
      .from(transactions)
      .where(baseWhere)
      .groupBy(transactions.categoryId);

    const byAccountRows = await this.db
      .select({
        accountId: transactions.accountId,
        netMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end), 0)::bigint`
      })
      .from(transactions)
      .where(baseWhere)
      .groupBy(transactions.accountId);

    const [totalsRow] = await this.db
      .select({
        totalExpenseMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        totalIncomeMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`
      })
      .from(transactions)
      .where(baseWhere);

    const document = {
      userId,
      month,
      byCategory: byCategoryRows.map((row) => ({
        ...(row.categoryId === null ? {} : { categoryId: row.categoryId }),
        spentMinor: Number(row.spentMinor),
        incomeMinor: Number(row.incomeMinor),
        txnCount: row.txnCount
      })),
      byAccount: byAccountRows.map((row) => ({
        accountId: row.accountId,
        netMinor: Number(row.netMinor)
      })),
      totalExpenseMinor: Number(totalsRow?.totalExpenseMinor ?? 0),
      totalIncomeMinor: Number(totalsRow?.totalIncomeMinor ?? 0),
      computedAt: new Date()
    };

    await this.db
      .insert(monthlyRollups)
      .values(document)
      .onConflictDoUpdate({
        target: [monthlyRollups.userId, monthlyRollups.month],
        set: {
          byCategory: document.byCategory,
          byAccount: document.byAccount,
          totalExpenseMinor: document.totalExpenseMinor,
          totalIncomeMinor: document.totalIncomeMinor,
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
