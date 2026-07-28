import type { Budget, BudgetCategory } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { InvalidCursorError } from "../../common/errors/invalid-cursor.error.js";
import { asMockDbTx, createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { BudgetRepository, encodeCursor } from "../budget.repository.js";

const BUDGET_ID = "123e4567-e89b-42d3-a456-426614174000";
const CATEGORY_ID = "223e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");

const BUDGET_ROW = {
  id: BUDGET_ID,
  userId: "u1",
  categoryId: CATEGORY_ID,
  limitMinor: 50_000,
  isArchived: false,
  createdAt: NOW,
  updatedAt: NOW
};

const CATEGORY_ROW = {
  id: CATEGORY_ID,
  userId: "u1",
  name: "Food",
  kind: "expense",
  parentId: null,
  icon: null,
  color: null,
  isArchived: false,
  createdAt: NOW,
  updatedAt: NOW
};

describe("BudgetRepository", () => {
  it("upserts and parses the returned budget", async () => {
    const db = createMockDrizzleDb([BUDGET_ROW]);
    const repository = new BudgetRepository(db);

    await expect(
      repository.upsert("u1", CATEGORY_ID, 50_000, asMockDbTx(db))
    ).resolves.toMatchObject({
      id: BUDGET_ID,
      limitMinor: 50_000
    });
    expect(db.insert).toHaveBeenCalled();
  });

  it("rejects an upsert that returns no row", async () => {
    const db = createMockDrizzleDb();
    const repository = new BudgetRepository(db);

    await expect(repository.upsert("u1", CATEGORY_ID, 50_000, asMockDbTx(db))).rejects.toThrow(
      "Budget upsert did not return a row."
    );
  });

  it("archives a row and returns null when no active row exists", async () => {
    const foundDb = createMockDrizzleDb([{ ...BUDGET_ROW, isArchived: true }]);
    const missingDb = createMockDrizzleDb();

    await expect(
      new BudgetRepository(foundDb).archive("u1", BUDGET_ID, asMockDbTx(foundDb))
    ).resolves.toMatchObject({ isArchived: true });
    await expect(
      new BudgetRepository(missingDb).archive("u1", BUDGET_ID, asMockDbTx(missingDb))
    ).resolves.toBeNull();
  });

  it("finds budgets by category and id through both executor paths", async () => {
    const foundDb = createMockDrizzleDb([BUDGET_ROW]);
    const missingDb = createMockDrizzleDb();
    const repository = new BudgetRepository(foundDb);

    await expect(repository.findByCategoryId("u1", CATEGORY_ID)).resolves.toMatchObject({
      id: BUDGET_ID
    });
    await expect(repository.findById("u1", BUDGET_ID, asMockDbTx(foundDb))).resolves.toMatchObject({
      categoryId: CATEGORY_ID
    });
    await expect(
      new BudgetRepository(missingDb).findByCategoryId("u1", CATEGORY_ID)
    ).resolves.toBeNull();
    await expect(new BudgetRepository(missingDb).findById("u1", BUDGET_ID)).resolves.toBeNull();
  });

  it("locks an active row and handles a missing row", async () => {
    const foundDb = createMockDrizzleDb([BUDGET_ROW]);
    const missingDb = createMockDrizzleDb();

    await expect(
      new BudgetRepository(foundDb).lockActiveById("u1", BUDGET_ID, asMockDbTx(foundDb))
    ).resolves.toMatchObject({ id: BUDGET_ID });
    expect(foundDb.for).toHaveBeenCalledWith("update");
    await expect(
      new BudgetRepository(missingDb).lockActiveById("u1", BUDGET_ID, asMockDbTx(missingDb))
    ).resolves.toBeNull();
  });

  it("lists a page, maps category data, and reports an extra row", async () => {
    const joinedRow = { budget: BUDGET_ROW, category: CATEGORY_ROW };
    const db = createMockDrizzleDb([joinedRow, joinedRow]);
    const repository = new BudgetRepository(db);

    await expect(repository.listPage("u1", { includeArchived: false, limit: 1 })).resolves.toEqual({
      items: [
        {
          budget: expect.objectContaining({ id: BUDGET_ID }),
          category: {
            id: CATEGORY_ID,
            name: "Food",
            icon: null,
            color: null,
            isArchived: false
          }
        }
      ],
      hasMore: true
    });
  });

  it("accepts a valid cursor and includeArchived while rejecting invalid cursors", async () => {
    const db = createMockDrizzleDb();
    const repository = new BudgetRepository(db);
    const cursor = encodeCursor(NOW, BUDGET_ID);

    await expect(
      repository.listPage("u1", { includeArchived: true, cursor, limit: 50 })
    ).resolves.toEqual({ items: [], hasMore: false });
    await expect(
      repository.listPage("u1", { includeArchived: false, cursor: "invalid", limit: 50 })
    ).rejects.toBeInstanceOf(InvalidCursorError);
  });

  it("lists every joined budget using an explicit transaction", async () => {
    const db = createMockDrizzleDb([{ budget: BUDGET_ROW, category: CATEGORY_ROW }]);
    const repository = new BudgetRepository(db);

    await expect(repository.listAllWithCategory("u1", asMockDbTx(db))).resolves.toEqual([
      {
        budget: expect.objectContaining({ id: BUDGET_ID }),
        category: expect.objectContaining({ id: CATEGORY_ID, name: "Food" })
      }
    ]);
  });

  it("finds all active budgets", async () => {
    const db = createMockDrizzleDb([BUDGET_ROW]);
    await expect(new BudgetRepository(db).findAllActive()).resolves.toEqual([
      expect.objectContaining({ id: BUDGET_ID })
    ]);
  });

  it("aggregates monthly category spend and converts bigint strings to numbers", async () => {
    const db = createMockDrizzleDb([
      { categoryId: CATEGORY_ID, spentMinor: "12345" },
      { categoryId: null, spentMinor: "55" }
    ]);
    const repository = new BudgetRepository(db);

    await expect(repository.categorySpendForMonth("u1", "2026-07")).resolves.toEqual(
      new Map<string | null, number>([
        [CATEGORY_ID, 12_345],
        [null, 55]
      ])
    );
    await expect(
      repository.categorySpendForMonth("u1", "2026-07", asMockDbTx(db))
    ).resolves.toEqual(
      new Map<string | null, number>([
        [CATEGORY_ID, 12_345],
        [null, 55]
      ])
    );
  });

  it("reads recorded thresholds and inserts alert events", async () => {
    const db = createMockDrizzleDb([{ thresholdBps: 8_000 }, { thresholdBps: 10_000 }]);
    const repository = new BudgetRepository(db);

    await expect(
      repository.findRecordedThresholds("u1", BUDGET_ID, "2026-07", 1, asMockDbTx(db))
    ).resolves.toEqual(new Set([8_000, 10_000]));
    await expect(
      repository.recordAlertEvent(
        {
          userId: "u1",
          budgetId: BUDGET_ID,
          month: "2026-07",
          policyVersion: 1,
          thresholdBps: 8_000,
          spentMinor: 40_000,
          limitMinor: 50_000
        },
        asMockDbTx(db)
      )
    ).resolves.toBeUndefined();
    expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ thresholdBps: 8_000 }));
  });
});

// Compile-time checks keep fixtures aligned with the shared schemas used at runtime.
void (BUDGET_ROW satisfies Budget);
void ({
  id: CATEGORY_ID,
  name: "Food",
  icon: null,
  color: null,
  isArchived: false
} satisfies BudgetCategory);
