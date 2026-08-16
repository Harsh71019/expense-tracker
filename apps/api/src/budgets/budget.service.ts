import { Inject, Injectable } from "@nestjs/common";
import {
  BudgetPageSchema,
  type Budget,
  type BudgetId,
  type BudgetOverview,
  type BudgetPage,
  type CategoryId,
  type ListBudgetsQuery,
  type UpsertBudget
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { CategoryKindMismatchError } from "../common/errors/category-kind-mismatch.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { addMonthsInIST, toISTMonth } from "../common/time/ist.js";
import {
  BUDGET_PACE_LOOKBACK_MONTHS,
  BUDGET_PACE_MAX_CATEGORIES,
  BUDGET_PACE_MAX_DAILY_ROWS,
  buildBudgetPace,
  type DailyCategorySpend
} from "./budget-pacing.js";
import { ALERT_THRESHOLDS_BPS, buildBudgetProgress } from "./budget-progress.js";
import { encodeCursor, type BudgetWithCategory } from "./budget.repository.js";
import { BudgetRepository } from "./budget.repository.js";

@Injectable()
export class BudgetService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly budgets: BudgetRepository,
    private readonly categories: CategoryRepository,
    private readonly audit: AuditRepository
  ) {}

  async list(userId: string, query: ListBudgetsQuery, now: Date = new Date()): Promise<BudgetPage> {
    const month = toISTMonth(now);
    const [page, all, spendByCategory] = await Promise.all([
      this.budgets.listPage(userId, query),
      this.budgets.listAllWithCategory(userId),
      this.budgets.categorySpendForMonth(userId, month, undefined, now)
    ]);

    const pacedCategoryIds = page.items
      .slice(0, BUDGET_PACE_MAX_CATEGORIES)
      .map((row) => row.category.id);
    const history = await this.budgets.categoryDailySpendHistory(
      userId,
      pacedCategoryIds,
      addMonthsInIST(now, -BUDGET_PACE_LOOKBACK_MONTHS),
      now
    );
    const resourceLimited = history.length > BUDGET_PACE_MAX_DAILY_ROWS;
    const historyByCategory = groupHistory(history);
    const last = page.items.at(-1);
    return BudgetPageSchema.parse({
      month,
      computedAt: now,
      alertPolicy: { thresholdsBps: ALERT_THRESHOLDS_BPS },
      overview: buildOverview(all, spendByCategory),
      items: page.items.map((row, index) => {
        const spentMinor = spendByCategory.get(row.category.id) ?? 0;
        const effective = !row.budget.isArchived && !row.category.isArchived;
        const pace = buildBudgetPace({
          categoryId: row.category.id,
          month,
          asOf: now,
          spentMinor,
          limitMinor: row.budget.limitMinor,
          effective,
          rows: historyByCategory.get(row.category.id) ?? [],
          resourceLimited: resourceLimited || index >= BUDGET_PACE_MAX_CATEGORIES
        });
        return buildBudgetProgress(row.budget, row.category, spentMinor, pace);
      }),
      pageInfo: {
        nextCursor:
          page.hasMore && last !== undefined
            ? encodeCursor(last.budget.createdAt, last.budget.id)
            : null,
        hasMore: page.hasMore,
        limit: query.limit
      }
    });
  }

  upsert(userId: string, categoryId: CategoryId, input: UpsertBudget): Promise<Budget> {
    return withTxn(this.db, (tx) => this.upsertInTx(userId, categoryId, input, tx));
  }

  async upsertInTx(
    userId: string,
    categoryId: CategoryId,
    input: UpsertBudget,
    tx: DbTx
  ): Promise<Budget> {
    const category = await this.categories.findActiveById(userId, categoryId, tx);
    if (category === null) throw new EntityNotFoundError("Category");
    if (category.kind !== "expense") throw new CategoryKindMismatchError();

    const before = await this.budgets.findByCategoryId(userId, categoryId, tx);
    const after = await this.budgets.upsert(userId, categoryId, input.limitMinor, tx);

    await this.audit.record(userId, "budget.upsert", after.id, tx, {
      before:
        before === null ? null : { limitMinor: before.limitMinor, isArchived: before.isArchived },
      after: { limitMinor: after.limitMinor, isArchived: after.isArchived }
    });
    return after;
  }

  archive(userId: string, budgetId: BudgetId): Promise<Budget> {
    return withTxn(this.db, (tx) => this.archiveInTx(userId, budgetId, tx));
  }

  async archiveInTx(userId: string, budgetId: BudgetId, tx: DbTx): Promise<Budget> {
    const archived = await this.budgets.archive(userId, budgetId, tx);
    if (archived === null) throw new EntityNotFoundError("Budget");
    await this.audit.record(userId, "budget.archive", budgetId, tx);
    return archived;
  }
}

function groupHistory(
  rows: readonly DailyCategorySpend[]
): ReadonlyMap<string, readonly DailyCategorySpend[]> {
  const grouped = new Map<string, DailyCategorySpend[]>();
  for (const row of rows)
    grouped.set(row.categoryId, [...(grouped.get(row.categoryId) ?? []), row]);
  return grouped;
}

/**
 * Effective = configuration active and its category still active (design
 * doc §4.4/§7) -- an archived category makes the budget ineffective without
 * deleting its history, so it drops out of the planned/spent totals but its
 * spend still shows up in unbudgetedSpentMinor below.
 */
function buildOverview(
  all: readonly BudgetWithCategory[],
  spendByCategory: ReadonlyMap<string | null, number>
): BudgetOverview {
  const effective = all.filter((row) => !row.budget.isArchived && !row.category.isArchived);
  const plannedMinor = effective.reduce((sum, row) => sum + row.budget.limitMinor, 0);
  const spentInBudgetedCategoriesMinor = effective.reduce(
    (sum, row) => sum + (spendByCategory.get(row.category.id) ?? 0),
    0
  );
  const totalExpenseMinor = [...spendByCategory.values()].reduce((sum, value) => sum + value, 0);

  return {
    plannedMinor,
    spentInBudgetedCategoriesMinor,
    remainingMinor: plannedMinor - spentInBudgetedCategoriesMinor,
    unbudgetedSpentMinor: Math.max(0, totalExpenseMinor - spentInBudgetedCategoriesMinor),
    activeBudgetCount: effective.length
  };
}
