import { Inject, Injectable } from "@nestjs/common";
import {
  AccountInsightsSchema,
  buildCategoryRollupNodes,
  groupCategoryRollupNodes,
  parseSafeIntegerMinor,
  sumMinorAmounts,
  type Account,
  type AccountInsights
} from "@treasury-ops/shared";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";

import { isActiveAssetFunding } from "../common/db/asset-funding-active.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { assetFundings, categories, transactions } from "../common/db/schema/index.js";
import type { AccountInsightsWindow } from "./account-insights-window.js";

const IST_TIME_ZONE = "Asia/Kolkata";

function parseCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RangeError("Count exceeds the supported integer range.");
  }
  return parsed;
}

@Injectable()
export class AccountInsightsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async get(
    userId: string,
    account: Account,
    window: AccountInsightsWindow
  ): Promise<AccountInsights> {
    const period =
      window.bucket === "day"
        ? sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE ${IST_TIME_ZONE}, 'YYYY-MM-DD')`
        : sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE ${IST_TIME_ZONE}, 'YYYY-MM-01')`;
    const inWindow = and(
      eq(transactions.userId, userId),
      eq(transactions.accountId, account.id),
      gte(transactions.occurredAt, window.from),
      lt(transactions.occurredAt, window.toExclusive)
    );

    const [priorRows, summaryRows, movementRows, spendingRows, hierarchy] = await Promise.all([
      this.db
        .select({
          deltaMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end), 0)::bigint`
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.accountId, account.id),
            lt(transactions.occurredAt, window.from)
          )
        ),
      this.db
        .select({
          incomeMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
          expenseMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
          transactionCount: sql<string>`count(*)::bigint`
        })
        .from(transactions)
        .where(inWindow),
      this.db
        .select({
          period,
          incomeMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
          expenseMinor: sql<string>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} else 0 end), 0)::bigint`
        })
        .from(transactions)
        .where(inWindow)
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      this.db
        .select({
          categoryId: transactions.categoryId,
          amountMinor: sql<string>`sum(${transactions.amountMinor})::bigint`,
          transactionCount: sql<string>`count(*)::bigint`
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
            inWindow,
            eq(transactions.status, "posted"),
            eq(transactions.type, "expense"),
            eq(transactions.purpose, "ordinary"),
            isNull(transactions.transferGroupId),
            isNull(assetFundings.id)
          )
        )
        .groupBy(transactions.categoryId),
      // Archived too: their historical spend must keep rolling up to a parent.
      this.db
        .select({
          id: categories.id,
          parentId: categories.parentId,
          name: categories.name,
          color: categories.color,
          isArchived: categories.isArchived
        })
        .from(categories)
        .where(eq(categories.userId, userId))
    ]);

    const priorDelta = parseSafeIntegerMinor(priorRows[0]?.deltaMinor ?? "0");
    const openingBalance = sumMinorAmounts([account.openingBalanceMinor, priorDelta]);
    const movementByPeriod = new Map(
      movementRows.map((row) => [
        row.period,
        {
          incomeMinor: parseSafeIntegerMinor(row.incomeMinor),
          expenseMinor: parseSafeIntegerMinor(row.expenseMinor)
        }
      ])
    );

    let runningBalance = openingBalance;
    const cashflowSeries = window.periods.map((periodKey) => {
      const movement = movementByPeriod.get(periodKey) ?? { incomeMinor: 0, expenseMinor: 0 };
      return { period: periodKey, ...movement };
    });
    const balanceSeries = cashflowSeries.map((point) => {
      runningBalance = sumMinorAmounts([runningBalance, point.incomeMinor, -point.expenseMinor]);
      return { period: point.period, balanceMinor: runningBalance };
    });
    const summary = summaryRows[0];
    const incomeMinor = parseSafeIntegerMinor(summary?.incomeMinor ?? "0");
    const expenseMinor = parseSafeIntegerMinor(summary?.expenseMinor ?? "0");

    return AccountInsightsSchema.parse({
      range: window.range,
      from: window.from,
      to: window.to,
      bucket: window.bucket,
      summary: {
        incomeMinor,
        expenseMinor,
        netMinor: sumMinorAmounts([incomeMinor, -expenseMinor]),
        transactionCount: parseCount(summary?.transactionCount ?? "0")
      },
      balanceSeries,
      cashflowSeries,
      spendingByCategory: groupCategoryRollupNodes(
        buildCategoryRollupNodes(
          hierarchy,
          spendingRows.map((row) => ({
            categoryId: row.categoryId,
            spentMinor: parseSafeIntegerMinor(row.amountMinor),
            incomeMinor: 0,
            txnCount: parseCount(row.transactionCount)
          }))
        )
      ).map(({ root, descendants }) => ({
        ...(root.categoryId === undefined ? {} : { categoryId: root.categoryId }),
        name: root.name,
        ...(root.color === undefined ? {} : { color: root.color }),
        amountMinor: root.totalSpentMinor,
        directAmountMinor: root.directSpentMinor,
        transactionCount: root.totalTxnCount,
        children: descendants
      }))
    });
  }
}
