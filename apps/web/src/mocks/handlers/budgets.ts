import type { HttpHandler } from "msw";

import { findCategory, type BudgetDto, type MockStore } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp } from "./types";

const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  year: "numeric",
  month: "2-digit",
  timeZone: "Asia/Kolkata"
});

function istMonth(date: Date): string {
  const parts = monthFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  return `${year}-${month}`;
}

function spendByCategory(store: MockStore, month: string): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  for (const transaction of store.transactions) {
    if (
      transaction.type !== "expense" ||
      transaction.status !== "posted" ||
      transaction.transferGroupId !== undefined ||
      transaction.occurredAt === null ||
      istMonth(new Date(transaction.occurredAt)) !== month
    ) {
      continue;
    }
    const categoryId = transaction.categoryId ?? null;
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + transaction.amountMinor);
  }
  return totals;
}

function isEffective(store: MockStore, budget: BudgetDto): boolean {
  const category = findCategory(store, budget.categoryId);
  return !budget.isArchived && category !== undefined && !category.isArchived;
}

function overview(
  store: MockStore,
  totals: ReadonlyMap<string | null, number>
): {
  plannedMinor: number;
  spentInBudgetedCategoriesMinor: number;
  remainingMinor: number;
  unbudgetedSpentMinor: number;
  activeBudgetCount: number;
} {
  const effective = store.budgets.filter((budget) => isEffective(store, budget));
  const plannedMinor = effective.reduce((sum, budget) => sum + budget.limitMinor, 0);
  const spentInBudgetedCategoriesMinor = effective.reduce(
    (sum, budget) => sum + (totals.get(budget.categoryId) ?? 0),
    0
  );
  const totalExpenseMinor = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
  return {
    plannedMinor,
    spentInBudgetedCategoriesMinor,
    remainingMinor: plannedMinor - spentInBudgetedCategoriesMinor,
    unbudgetedSpentMinor: Math.max(0, totalExpenseMinor - spentInBudgetedCategoriesMinor),
    activeBudgetCount: effective.length
  };
}

function findBudget(store: MockStore, budgetId: string): BudgetDto | undefined {
  return store.budgets.find((budget) => budget.id === budgetId);
}

export function budgetHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/budgets", ({ query, response }) => {
      const month = istMonth(new Date());
      const totals = spendByCategory(store, month);
      const includeArchived = query.get("includeArchived") === "true";
      const limitRaw = query.get("limit");
      const limit = limitRaw === null ? 50 : Number(limitRaw);
      const cursor = query.get("cursor");
      const sorted = store.budgets
        .filter((budget) => includeArchived || !budget.isArchived)
        .sort((left, right) => {
          const created = (left.createdAt ?? "").localeCompare(right.createdAt ?? "");
          return created === 0 ? left.id.localeCompare(right.id) : created;
        });
      const startIndex =
        cursor === null ? 0 : Math.max(sorted.findIndex((budget) => budget.id === cursor) + 1, 0);
      const page = sorted.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < sorted.length;
      const last = page.at(-1);
      return response(200).json({
        month,
        computedAt: new Date().toISOString(),
        alertPolicy: { thresholdsBps: [8000, 10_000] },
        overview: overview(store, totals),
        items: page.flatMap((budget) => {
          const category = findCategory(store, budget.categoryId);
          if (category === undefined) return [];
          const spentMinor = totals.get(category.id) ?? 0;
          const utilizationBps = Math.floor((spentMinor * 10_000) / budget.limitMinor);
          return [
            {
              budget,
              category: {
                id: category.id,
                name: category.name,
                icon: category.icon ?? null,
                color: category.color ?? null,
                isArchived: category.isArchived
              },
              spentMinor,
              remainingMinor: budget.limitMinor - spentMinor,
              utilizationBps,
              state:
                utilizationBps >= 10_000
                  ? ("reached" as const)
                  : utilizationBps >= 8000
                    ? ("approaching" as const)
                    : ("under" as const),
              isEffective: isEffective(store, budget)
            }
          ];
        }),
        pageInfo: {
          nextCursor: hasMore && last !== undefined ? last.id : null,
          hasMore,
          limit
        }
      });
    }),

    http.put("/v1/budgets/{categoryId}", async ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.budgets.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }
      const category = findCategory(store, params.categoryId);
      if (category === undefined || category.isArchived) {
        return response(404).json(mockProblem(404, "common.not_found", "Category not found."));
      }
      if (category.kind !== "expense") {
        return response(422).json(
          mockProblem(422, "category.kind_mismatch", "Budget category must be an expense.")
        );
      }
      const body = await request.json();
      if (body === undefined || body.limitMinor < 1) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "A positive limit is required.")
        );
      }
      const now = new Date().toISOString();
      let budget = store.budgets.find((candidate) => candidate.categoryId === category.id);
      if (budget === undefined) {
        budget = {
          id: store.nextBudgetId(),
          userId: store.profile.userId,
          categoryId: category.id,
          limitMinor: body.limitMinor,
          isArchived: false,
          createdAt: now,
          updatedAt: now
        };
        store.budgets.push(budget);
      } else {
        budget.limitMinor = body.limitMinor;
        budget.isArchived = false;
        budget.updatedAt = now;
      }
      store.idempotency.budgets.set(key, budget);
      return response(200).json(budget);
    }),

    http.patch("/v1/budgets/{budgetId}/archive", ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.budgetArchive.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }
      const budget = findBudget(store, params.budgetId);
      if (budget === undefined || budget.isArchived) {
        return response(404).json(mockProblem(404, "common.not_found", "Budget not found."));
      }
      budget.isArchived = true;
      budget.updatedAt = new Date().toISOString();
      store.idempotency.budgetArchive.set(key, budget);
      return response(200).json(budget);
    })
  ];
}
