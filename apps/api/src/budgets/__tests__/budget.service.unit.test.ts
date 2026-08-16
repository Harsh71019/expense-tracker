import type { Budget, BudgetCategory } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { CategoryKindMismatchError } from "../../common/errors/category-kind-mismatch.error.js";
import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { BudgetMutationService } from "../budget-mutation.service.js";
import { BudgetService } from "../budget.service.js";

const BUDGET_ID = "123e4567-e89b-42d3-a456-426614174000";
const CATEGORY_ID = "223e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-18T12:00:00.000Z");
const BUDGET: Budget = {
  id: BUDGET_ID,
  userId: "u1",
  categoryId: CATEGORY_ID,
  limitMinor: 50_000,
  isArchived: false,
  createdAt: NOW,
  updatedAt: NOW
};
const CATEGORY: BudgetCategory & { kind: "expense" } = {
  id: CATEGORY_ID,
  name: "Food",
  kind: "expense",
  icon: null,
  color: null,
  isArchived: false
};

function createService(
  options?: Readonly<{
    category?: Readonly<{
      id: string;
      name: string;
      kind: "expense" | "income";
      icon: string | null;
      color: string | null;
      isArchived: boolean;
    }> | null;
    before?: Budget | null;
  }>
) {
  const tx = {};
  const db = { transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx)) };
  const budgets = {
    listPage: vi.fn(),
    listAllWithCategory: vi.fn(),
    categorySpendForMonth: vi.fn(),
    categoryDailySpendHistory: vi.fn().mockResolvedValue([]),
    findByCategoryId: vi.fn().mockResolvedValue(options?.before ?? null),
    upsert: vi.fn().mockResolvedValue(BUDGET),
    archive: vi.fn().mockResolvedValue(BUDGET)
  };
  const categories = {
    findActiveById: vi
      .fn()
      .mockResolvedValue(options?.category === undefined ? CATEGORY : options.category)
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new BudgetService(
    focusedTestDouble(db),
    focusedTestDouble(budgets),
    focusedTestDouble(categories),
    focusedTestDouble(audit)
  );
  return { service, db, budgets, categories, audit, tx };
}

describe("BudgetService", () => {
  it("lists progress, overview totals, and a next cursor", async () => {
    const context = createService();
    context.budgets.listPage.mockResolvedValue({
      items: [{ budget: BUDGET, category: CATEGORY }],
      hasMore: true
    });
    context.budgets.listAllWithCategory.mockResolvedValue([
      { budget: BUDGET, category: CATEGORY },
      {
        budget: { ...BUDGET, id: "323e4567-e89b-42d3-a456-426614174000", isArchived: true },
        category: { ...CATEGORY, id: "423e4567-e89b-42d3-a456-426614174000" }
      },
      {
        budget: { ...BUDGET, id: "523e4567-e89b-42d3-a456-426614174000" },
        category: {
          ...CATEGORY,
          id: "623e4567-e89b-42d3-a456-426614174000",
          isArchived: true
        }
      }
    ]);
    context.budgets.categorySpendForMonth.mockResolvedValue(
      new Map<string | null, number>([
        [CATEGORY_ID, 40_000],
        [null, 7_500]
      ])
    );

    const result = await context.service.list("u1", { includeArchived: false, limit: 1 }, NOW);

    expect(result.month).toBe("2026-07");
    expect(result.items[0]).toMatchObject({ spentMinor: 40_000, state: "approaching" });
    expect(result.overview).toEqual({
      plannedMinor: 50_000,
      spentInBudgetedCategoriesMinor: 40_000,
      remainingMinor: 10_000,
      unbudgetedSpentMinor: 7_500,
      activeBudgetCount: 1
    });
    expect(result.pageInfo).toMatchObject({ hasMore: true, limit: 1 });
    expect(result.pageInfo.nextCursor).toEqual(expect.any(String));
  });

  it("returns no cursor for an empty final page and clamps negative unbudgeted spend", async () => {
    const context = createService();
    context.budgets.listPage.mockResolvedValue({ items: [], hasMore: false });
    context.budgets.listAllWithCategory.mockResolvedValue([{ budget: BUDGET, category: CATEGORY }]);
    context.budgets.categorySpendForMonth.mockResolvedValue(new Map([[CATEGORY_ID, 60_000]]));

    const result = await context.service.list("u1", { includeArchived: true, limit: 50 }, NOW);

    expect(result.pageInfo.nextCursor).toBeNull();
    expect(result.overview.unbudgetedSpentMinor).toBe(0);
  });

  it("zero-fills missing spend entries for effective budget categories", async () => {
    const context = createService();
    context.budgets.listPage.mockResolvedValue({
      items: [{ budget: BUDGET, category: CATEGORY }],
      hasMore: false
    });
    context.budgets.listAllWithCategory.mockResolvedValue([{ budget: BUDGET, category: CATEGORY }]);
    context.budgets.categorySpendForMonth.mockResolvedValue(new Map([[null, 500]]));

    const result = await context.service.list("u1", { includeArchived: false, limit: 50 }, NOW);

    expect(result.items[0]).toMatchObject({ spentMinor: 0 });
    expect(result.overview.spentInBudgetedCategoriesMinor).toBe(0);
  });

  it("upserts through the public transaction wrapper", async () => {
    const context = createService();

    await expect(context.service.upsert("u1", CATEGORY_ID, { limitMinor: 50_000 })).resolves.toBe(
      BUDGET
    );
    expect(context.db.transaction).toHaveBeenCalledOnce();
    expect(context.audit.record).toHaveBeenCalledWith(
      "u1",
      "budget.upsert",
      BUDGET_ID,
      context.tx,
      {
        before: null,
        after: { limitMinor: 50_000, isArchived: false }
      }
    );
  });

  it("records the previous state when updating a budget", async () => {
    const context = createService({ before: { ...BUDGET, limitMinor: 25_000, isArchived: true } });

    await context.service.upsertInTx(
      "u1",
      CATEGORY_ID,
      { limitMinor: 50_000 },
      focusedTestDouble(context.tx)
    );
    expect(context.audit.record).toHaveBeenCalledWith(
      "u1",
      "budget.upsert",
      BUDGET_ID,
      context.tx,
      expect.objectContaining({
        before: { limitMinor: 25_000, isArchived: true }
      })
    );
  });

  it("rejects a missing or non-expense category", async () => {
    const missing = createService({ category: null });
    const income = createService({ category: { ...CATEGORY, kind: "income" } });

    await expect(
      missing.service.upsertInTx(
        "u1",
        CATEGORY_ID,
        { limitMinor: 1 },
        focusedTestDouble(missing.tx)
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(
      income.service.upsertInTx("u1", CATEGORY_ID, { limitMinor: 1 }, focusedTestDouble(income.tx))
    ).rejects.toBeInstanceOf(CategoryKindMismatchError);
  });

  it("archives through the public wrapper and audits the mutation", async () => {
    const context = createService();

    await expect(context.service.archive("u1", BUDGET_ID)).resolves.toBe(BUDGET);
    expect(context.audit.record).toHaveBeenCalledWith(
      "u1",
      "budget.archive",
      BUDGET_ID,
      context.tx
    );
  });

  it("rejects an archive when no active budget exists", async () => {
    const context = createService();
    context.budgets.archive.mockResolvedValue(null);

    await expect(
      context.service.archiveInTx("u1", BUDGET_ID, focusedTestDouble(context.tx))
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});

describe("BudgetMutationService", () => {
  it("runs upsert and archive callbacks through idempotency", async () => {
    const budgets = {
      upsertInTx: vi.fn().mockResolvedValue(BUDGET),
      archiveInTx: vi.fn().mockResolvedValue({ ...BUDGET, isArchived: true })
    };
    const tx = {};
    const idempotency = {
      execute: vi.fn(
        async (
          _userId: string,
          _operation: string,
          _key: string,
          _intent: unknown,
          _schema: unknown,
          work: (value: object) => Promise<Budget>
        ) => ({ result: await work(tx), replayed: false })
      )
    };
    // @ts-expect-error - focused collaborators implement the exercised methods.
    const service = new BudgetMutationService(budgets, idempotency);

    await expect(
      service.upsert("u1", CATEGORY_ID, { limitMinor: 50_000 }, "key-1")
    ).resolves.toMatchObject({ result: BUDGET, replayed: false });
    await expect(service.archive("u1", BUDGET_ID, "key-2")).resolves.toMatchObject({
      result: { isArchived: true }
    });
    expect(budgets.upsertInTx).toHaveBeenCalledWith("u1", CATEGORY_ID, { limitMinor: 50_000 }, tx);
    expect(budgets.archiveInTx).toHaveBeenCalledWith("u1", BUDGET_ID, tx);
  });
});
