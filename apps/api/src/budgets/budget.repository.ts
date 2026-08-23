import { Inject, Injectable } from "@nestjs/common";
import {
  BudgetSchema,
  type Budget,
  type BudgetCategory,
  type BudgetId
} from "@treasury-ops/shared";
import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { isActiveAssetFunding } from "../common/db/asset-funding-active.js";
import type { DbTx } from "../common/db/db-txn.js";
import {
  assetFundings,
  budgetAlertEvents,
  budgets,
  categories,
  transactions
} from "../common/db/schema/index.js";
import { decodeCursorPayload, encodeCursorPayload } from "../common/pagination/cursor.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DailyCategorySpend } from "./budget-pacing.js";

const IST_TIME_ZONE = "Asia/Kolkata";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const CursorPayloadSchema = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() });

export type BudgetWithCategory = Readonly<{ budget: Budget; category: BudgetCategory }>;

export type NewAlertEvent = Readonly<{
  userId: string;
  budgetId: BudgetId;
  month: string;
  policyVersion: number;
  thresholdBps: number;
  spentMinor: number;
  limitMinor: number;
}>;

@Injectable()
export class BudgetRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /**
   * Create, update, or restore in one statement -- (userId, categoryId) is
   * unique, so a repeat PUT for the same category always targets the same
   * lifetime row (design doc §5: "one lifetime configuration per
   * user/category... PUT updates or restores it").
   */
  async upsert(userId: string, categoryId: string, limitMinor: number, tx: DbTx): Promise<Budget> {
    const now = new Date();
    const [row] = await tx
      .insert(budgets)
      .values({
        userId,
        categoryId,
        limitMinor,
        isArchived: false,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.categoryId],
        set: { limitMinor, isArchived: false, updatedAt: now }
      })
      .returning();
    if (row === undefined) throw new Error("Budget upsert did not return a row.");
    return toBudget(row);
  }

  /**
   * Returns the archived row (not just a boolean) -- the design doc's PATCH
   * .../archive endpoint returns the archived configuration so an idempotent
   * replay has something to hand back.
   */
  async archive(userId: string, budgetId: BudgetId, tx: DbTx): Promise<Budget | null> {
    const [row] = await tx
      .update(budgets)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(
        and(eq(budgets.id, budgetId), eq(budgets.userId, userId), eq(budgets.isArchived, false))
      )
      .returning();
    return row === undefined ? null : toBudget(row);
  }

  async findByCategoryId(userId: string, categoryId: string, tx?: DbTx): Promise<Budget | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)));
    return row === undefined ? null : toBudget(row);
  }

  async findById(userId: string, budgetId: BudgetId, tx?: DbTx): Promise<Budget | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.userId, userId)));
    return row === undefined ? null : toBudget(row);
  }

  /**
   * SELECT ... FOR UPDATE, scoped to an active budget -- serializes
   * concurrent alert-cron passes over the same budget so a second pass that
   * unblocks after the first commits re-reads its already-recorded
   * thresholds instead of racing it (see BudgetAlertCron).
   */
  async lockActiveById(userId: string, budgetId: BudgetId, tx: DbTx): Promise<Budget | null> {
    const [row] = await tx
      .select()
      .from(budgets)
      .where(
        and(eq(budgets.id, budgetId), eq(budgets.userId, userId), eq(budgets.isArchived, false))
      )
      .for("update");
    return row === undefined ? null : toBudget(row);
  }

  /**
   * One page of budgets joined with their category, ordered oldest-created-
   * first per the design doc (unlike transactions' newest-first list).
   */
  async listPage(
    userId: string,
    options: Readonly<{ includeArchived: boolean; cursor?: string | undefined; limit: number }>,
    tx?: DbTx
  ): Promise<Readonly<{ items: BudgetWithCategory[]; hasMore: boolean }>> {
    const executor = tx ?? this.db;
    const cursor = options.cursor === undefined ? null : decodeCursor(options.cursor);
    const conditions = [eq(budgets.userId, userId)];
    if (!options.includeArchived) conditions.push(eq(budgets.isArchived, false));
    if (cursor !== null) {
      conditions.push(
        sql`(${budgets.createdAt}, ${budgets.id}) > (${cursor.createdAt}, ${cursor.id})`
      );
    }

    const rows = await executor
      .select({ budget: budgets, category: categories })
      .from(budgets)
      .innerJoin(categories, eq(categories.id, budgets.categoryId))
      .where(and(...conditions))
      .orderBy(asc(budgets.createdAt), asc(budgets.id))
      .limit(options.limit + 1);

    const page = rows.slice(0, options.limit);
    return {
      items: page.map(toBudgetWithCategory),
      hasMore: rows.length > options.limit
    };
  }

  /**
   * Every budget for the user with its category, unpaginated -- overview
   * totals cover every effective budget regardless of the requested page
   * (design doc §4.4).
   */
  async listAllWithCategory(userId: string, tx?: DbTx): Promise<BudgetWithCategory[]> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select({ budget: budgets, category: categories })
      .from(budgets)
      .innerJoin(categories, eq(categories.id, budgets.categoryId))
      .where(eq(budgets.userId, userId));
    return rows.map(toBudgetWithCategory);
  }

  /**
   * Worker sweep across tenants for the daily threshold cron -- every
   * follow-up read/write stays scoped by the row's own userId, mirroring
   * GoalRepository.findAllActive.
   */
  async findAllActive(): Promise<Budget[]> {
    const rows = await this.db.select().from(budgets).where(eq(budgets.isArchived, false));
    return rows.map(toBudget);
  }

  /**
   * One grouped aggregate over the user's current-IST-month posted,
   * non-transfer expense transactions -- reused for both per-budget progress
   * and the unbudgeted-spend overview total, mirroring
   * MonthlyRollupRepository.recompute's rough-UTC-bound + exact-IST-`to_char`
   * approach. Deliberately excludes transferGroupId legs (the nightly rollup
   * does not, but budget progress must not inherit that semantic -- design
   * doc §2).
   */
  async categorySpendForMonth(
    userId: string,
    month: string,
    tx?: DbTx,
    asOf?: Date
  ): Promise<Map<string | null, number>> {
    const executor = tx ?? this.db;
    const { roughStart, roughEnd } = roughMonthBounds(month);
    const istMonth = sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE ${IST_TIME_ZONE}, 'YYYY-MM')`;

    const rows = await executor
      .select({
        categoryId: transactions.categoryId,
        spentMinor: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)::bigint`
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
          eq(transactions.type, "expense"),
          eq(transactions.purpose, "ordinary"),
          sql`${transactions.transferGroupId} IS NULL`,
          sql`${assetFundings.id} IS NULL`,
          gte(transactions.occurredAt, roughStart),
          lt(transactions.occurredAt, roughEnd),
          ...(asOf === undefined ? [] : [lte(transactions.occurredAt, asOf)]),
          sql`${istMonth} = ${month}`
        )
      )
      .groupBy(transactions.categoryId);

    return new Map(rows.map((row) => [row.categoryId, Number(row.spentMinor)]));
  }

  /**
   * Bounded daily expense totals for pace analysis. `asOf` is a hard upper
   * bound, preventing future rows from leaking into a historical evaluation.
   * The caller limits category count and consumes at most MAX_DAILY_ROWS.
   */
  async categoryDailySpendHistory(
    userId: string,
    categoryIds: readonly string[],
    start: Date,
    asOf: Date
  ): Promise<DailyCategorySpend[]> {
    if (categoryIds.length === 0) return [];
    // Keep the time zone literal inside the expression. Drizzle emits a new
    // bind parameter for every reuse of a SQL fragment; PostgreSQL then sees
    // SELECT/GROUP BY as different expressions and rejects the aggregate.
    const istDay = sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        categoryId: transactions.categoryId,
        day: istDay,
        spentMinor: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)::bigint`
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
          inArray(transactions.categoryId, [...categoryIds]),
          eq(transactions.status, "posted"),
          eq(transactions.type, "expense"),
          eq(transactions.purpose, "ordinary"),
          sql`${transactions.transferGroupId} IS NULL`,
          sql`${assetFundings.id} IS NULL`,
          gte(transactions.occurredAt, start),
          lte(transactions.occurredAt, asOf)
        )
      )
      .groupBy(transactions.categoryId, istDay)
      .orderBy(asc(istDay))
      .limit(10_001);
    return rows.flatMap((row) =>
      row.categoryId === null
        ? []
        : [{ categoryId: row.categoryId, day: row.day, spentMinor: Number(row.spentMinor) }]
    );
  }

  async findRecordedThresholds(
    userId: string,
    budgetId: BudgetId,
    month: string,
    policyVersion: number,
    tx: DbTx
  ): Promise<Set<number>> {
    const rows = await tx
      .select({ thresholdBps: budgetAlertEvents.thresholdBps })
      .from(budgetAlertEvents)
      .where(
        and(
          eq(budgetAlertEvents.userId, userId),
          eq(budgetAlertEvents.budgetId, budgetId),
          eq(budgetAlertEvents.month, month),
          eq(budgetAlertEvents.policyVersion, policyVersion)
        )
      );
    return new Set(rows.map((row) => row.thresholdBps));
  }

  async recordAlertEvent(event: NewAlertEvent, tx: DbTx): Promise<void> {
    await tx.insert(budgetAlertEvents).values({ ...event, createdAt: new Date() });
  }
}

function toBudget(row: typeof budgets.$inferSelect): Budget {
  return BudgetSchema.parse(stripNulls(row));
}

function toBudgetWithCategory(row: {
  budget: typeof budgets.$inferSelect;
  category: typeof categories.$inferSelect;
}): BudgetWithCategory {
  return {
    budget: toBudget(row.budget),
    category: {
      id: row.category.id,
      name: row.category.name,
      icon: row.category.icon,
      color: row.category.color,
      isArchived: row.category.isArchived
    }
  };
}

function roughMonthBounds(month: string): { roughStart: Date; roughEnd: Date } {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  return {
    roughStart: new Date(Date.UTC(year, monthIndex, 1) - ONE_DAY_MS),
    roughEnd: new Date(Date.UTC(year, monthIndex + 1, 1) + ONE_DAY_MS)
  };
}

export function encodeCursor(createdAt: Date, id: string): string {
  return encodeCursorPayload({ createdAt: createdAt.toISOString(), id });
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const payload = decodeCursorPayload(cursor, CursorPayloadSchema);
  return { createdAt: new Date(payload.createdAt), id: payload.id };
}
