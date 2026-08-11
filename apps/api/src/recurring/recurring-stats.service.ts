import { Injectable } from "@nestjs/common";
import {
  computeNextOccurrence,
  RecurringStatsSchema,
  sumMinorAmounts,
  type Category,
  type CategoryId,
  type RecurringRule,
  type RecurringStats,
  type TopSpendingCategory
} from "@treasury-ops/shared";

import { CategoryRepository } from "../categories/category.repository.js";
import { RecurringRuleRepository } from "./recurring-rule.repository.js";

const FORECAST_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const UNCATEGORIZED_KEY = "uncategorized";

@Injectable()
export class RecurringStatsService {
  constructor(
    private readonly rules: RecurringRuleRepository,
    private readonly categories: CategoryRepository
  ) {}

  async getStats(userId: string): Promise<RecurringStats> {
    const [rules, categories] = await Promise.all([
      this.rules.list(userId),
      this.categories.list(userId)
    ]);
    return calculateRecurringStats(rules, categories, new Date());
  }
}

export function calculateRecurringStats(
  rules: readonly RecurringRule[],
  categories: readonly Category[],
  now: Date
): RecurringStats {
  const activeRules = rules.filter((rule) => !rule.isPaused);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const spendingByCategory = new Map<string, TopSpendingCategory>();
  const expenseAmounts: number[] = [];
  const incomeAmounts: number[] = [];
  const windowEnd = new Date(now.getTime() + FORECAST_DAYS * ONE_DAY_MS);
  let upcomingTransactionCount = 0;

  for (const rule of activeRules) {
    let occurrence: Date | null = rule.nextRunAt;
    while (occurrence !== null && occurrence.getTime() <= windowEnd.getTime()) {
      if (occurrence.getTime() >= now.getTime()) {
        upcomingTransactionCount += 1;
        if (rule.template.type === "income") {
          incomeAmounts.push(rule.template.amountMinor);
        } else {
          expenseAmounts.push(rule.template.amountMinor);
          addCategorySpend(
            spendingByCategory,
            rule.template.categoryId,
            categoriesById,
            rule.template.amountMinor
          );
        }
      }
      occurrence = computeNextOccurrence(rule.rrule, rule.startAt, occurrence);
    }
  }

  const upcomingExpenseMinor = sumMinorAmounts(expenseAmounts);
  const upcomingIncomeMinor = sumMinorAmounts(incomeAmounts);
  const topSpendingCategory = [...spendingByCategory.values()].sort(
    (left, right) =>
      compareMoneyDescending(left.amountMinor, right.amountMinor) ||
      right.transactionCount - left.transactionCount ||
      left.name.localeCompare(right.name)
  )[0];

  return RecurringStatsSchema.parse({
    forecastDays: FORECAST_DAYS,
    totalRules: rules.length,
    activeRules: activeRules.length,
    pausedRules: rules.length - activeRules.length,
    upcomingTransactionCount,
    upcomingExpenseMinor,
    upcomingIncomeMinor,
    upcomingNetMinor: sumMinorAmounts([upcomingIncomeMinor, -upcomingExpenseMinor]),
    topSpendingCategory: topSpendingCategory ?? null
  });
}

function compareMoneyDescending(left: number, right: number): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function addCategorySpend(
  totals: Map<string, TopSpendingCategory>,
  categoryId: CategoryId | undefined,
  categoriesById: ReadonlyMap<CategoryId, Category>,
  amountMinor: number
): void {
  const key = categoryId ?? UNCATEGORIZED_KEY;
  const current = totals.get(key);
  if (current !== undefined) {
    totals.set(key, {
      ...current,
      amountMinor: sumMinorAmounts([current.amountMinor, amountMinor]),
      transactionCount: current.transactionCount + 1
    });
    return;
  }

  const category = categoryId === undefined ? undefined : categoriesById.get(categoryId);
  totals.set(key, {
    ...(categoryId === undefined ? {} : { categoryId }),
    name: category?.name ?? "Uncategorized",
    ...(category?.color === undefined ? {} : { color: category.color }),
    ...(category?.icon === undefined ? {} : { icon: category.icon }),
    amountMinor,
    transactionCount: 1
  });
}
