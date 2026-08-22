import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { MonthSchema, parseSafeIntegerMinor, type Month } from "@treasury-ops/shared";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { categories, transactions } from "../common/db/schema/index.js";
import { istMonthBounds } from "../common/time/ist.js";
import type { MonthlyLedgerExpenseFacts } from "./essential-burn.js";

/**
 * Tenant-scoped repository for aggregating ledger expense facts
 * across candidate IST calendar months and the current partial month.
 *
 * Rules:
 * - Scoped strictly by userId on both transactions and joined categories.
 * - Only posted, non-reversed, non-reversal, non-transfer, ordinary-purpose
 *   expense transactions (a receivable-principal lend disbursement is
 *   balance-sheet movement, not essential/lifestyle burn).
 * - Categories include active and archived categories without distinction.
 * - SQL-level aggregation only; never loads unbounded transaction rows into memory.
 */
@Injectable()
export class EssentialBurnRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async getMonthlyLedgerExpenseFacts(
    userId: string,
    candidateMonths: readonly [Month, Month, Month],
    currentMonth: Month
  ): Promise<Map<string, MonthlyLedgerExpenseFacts>> {
    const oldestMonth = candidateMonths[0];
    const windowStart = istMonthBounds(oldestMonth).start;
    const windowEnd = istMonthBounds(currentMonth).end;

    const rows = await this.db
      .select({
        month: sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`,
        eligibleExpenseCount: sql<number>`count(*)::int`,
        totalExpenseMinor: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)::text`,
        essentialCount: sql<number>`count(*) filter (where ${categories.group} = 'essential')::int`,
        essentialMinor: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${categories.group} = 'essential'), 0)::text`,
        lifestyleCount: sql<number>`count(*) filter (where ${categories.group} = 'lifestyle')::int`,
        lifestyleMinor: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${categories.group} = 'lifestyle'), 0)::text`,
        uncategorizedCount: sql<number>`count(*) filter (where ${transactions.categoryId} is null)::int`,
        uncategorizedMinor: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.categoryId} is null), 0)::text`,
        ungroupedCount: sql<number>`count(*) filter (where ${transactions.categoryId} is not null and ${categories.group} is null)::int`,
        ungroupedMinor: sql<string>`coalesce(sum(${transactions.amountMinor}) filter (where ${transactions.categoryId} is not null and ${categories.group} is null), 0)::text`
      })
      .from(transactions)
      .leftJoin(
        categories,
        and(eq(transactions.categoryId, categories.id), eq(categories.userId, userId))
      )
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "expense"),
          eq(transactions.status, "posted"),
          eq(transactions.purpose, "ordinary"),
          isNull(transactions.reversalOf),
          isNull(transactions.reversedBy),
          isNull(transactions.transferGroupId),
          gte(transactions.occurredAt, windowStart),
          lt(transactions.occurredAt, windowEnd)
        )
      )
      .groupBy(sql`to_char(${transactions.occurredAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`);

    const result = new Map<string, MonthlyLedgerExpenseFacts>();

    for (const row of rows) {
      result.set(row.month, {
        month: MonthSchema.parse(row.month),
        eligibleExpenseCount: Number(row.eligibleExpenseCount),
        totalExpenseMinor: parseSafeIntegerMinor(row.totalExpenseMinor),
        essentialCount: Number(row.essentialCount),
        essentialMinor: parseSafeIntegerMinor(row.essentialMinor),
        lifestyleCount: Number(row.lifestyleCount),
        lifestyleMinor: parseSafeIntegerMinor(row.lifestyleMinor),
        uncategorizedCount: Number(row.uncategorizedCount),
        uncategorizedMinor: parseSafeIntegerMinor(row.uncategorizedMinor),
        ungroupedCount: Number(row.ungroupedCount),
        ungroupedMinor: parseSafeIntegerMinor(row.ungroupedMinor)
      });
    }

    return result;
  }
}
