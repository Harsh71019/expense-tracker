import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { categories, transactions } from "../common/db/schema/index.js";
import { toISTMonth } from "../common/time/ist.js";

export const LedgerHistoryDiagnosticFactsSchema = z.object({
  completeMonthCount: z.number().int().min(0),
  qualifyingTransactionCount: z.number().int().min(0),
  latestExpenseAt: z.coerce.date().nullable(),
  oldestExpenseAt: z.coerce.date().nullable(),
  months: z.array(z.string()),
  hasCurrentMonthExpenses: z.boolean()
});

export type LedgerHistoryDiagnosticFacts = z.infer<typeof LedgerHistoryDiagnosticFactsSchema>;

/**
 * Tenant-scoped narrow read port for ledger history coverage facts consumed by
 * the financial readiness diagnostic.
 *
 * Requirements (docs/features/01-financial-profile-onboarding/03-onboarding-diagnostic/backend.md):
 * - Qualifying history: expense, posted, not reversed, not a reversal, not a transfer leg, essential category.
 * - Counts distinct complete Asia/Kolkata calendar months strictly before the current partial month.
 * - Aggregated in SQL to avoid loading arbitrary numbers of transaction rows into memory.
 * - Read-only by construction; returns bounded aggregates and dates, NEVER spending amounts.
 */
@Injectable()
export class LedgerHistoryDiagnosticReadService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async getLedgerHistoryDiagnosticFacts(
    userId: string,
    asOf: Date = new Date()
  ): Promise<LedgerHistoryDiagnosticFacts> {
    const currentMonth = toISTMonth(asOf);

    const rows = await this.db
      .select({
        month: sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`,
        transactionCount: sql<number>`count(*)::int`,
        latestExpenseAt: sql<Date | string | null>`max(${transactions.occurredAt})`,
        oldestExpenseAt: sql<Date | string | null>`min(${transactions.occurredAt})`
      })
      .from(transactions)
      .innerJoin(
        categories,
        and(eq(transactions.categoryId, categories.id), eq(categories.userId, userId))
      )
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "expense"),
          eq(transactions.status, "posted"),
          isNull(transactions.reversalOf),
          isNull(transactions.reversedBy),
          isNull(transactions.transferGroupId),
          eq(categories.group, "essential")
        )
      )
      .groupBy(sql`to_char(${transactions.occurredAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`);

    let qualifyingTransactionCount = 0;
    const completeMonthsSet = new Set<string>();
    let hasCurrentMonthExpenses = false;
    let latestExpenseAt: Date | null = null;
    let oldestExpenseAt: Date | null = null;

    for (const row of rows) {
      const month = row.month;
      qualifyingTransactionCount += Number(row.transactionCount);

      if (month === currentMonth) {
        hasCurrentMonthExpenses = true;
      } else if (month < currentMonth) {
        completeMonthsSet.add(month);
      }

      if (row.latestExpenseAt !== null) {
        const rowLatest = new Date(row.latestExpenseAt);
        if (latestExpenseAt === null || rowLatest > latestExpenseAt) {
          latestExpenseAt = rowLatest;
        }
      }

      if (row.oldestExpenseAt !== null) {
        const rowOldest = new Date(row.oldestExpenseAt);
        if (oldestExpenseAt === null || rowOldest < oldestExpenseAt) {
          oldestExpenseAt = rowOldest;
        }
      }
    }

    const months = Array.from(completeMonthsSet).sort();

    return LedgerHistoryDiagnosticFactsSchema.parse({
      completeMonthCount: months.length,
      qualifyingTransactionCount,
      latestExpenseAt,
      oldestExpenseAt,
      months,
      hasCurrentMonthExpenses
    });
  }
}
