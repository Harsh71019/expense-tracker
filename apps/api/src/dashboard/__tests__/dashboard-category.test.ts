import type { Category, CategoryRollup } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { enrichCategoryTotal, mergeCategoryRollups } from "../dashboard-category.js";

describe("mergeCategoryRollups", () => {
  it("sums rollups for the same category across multiple entries", () => {
    const rollups: CategoryRollup[] = [
      { categoryId: "food", spentMinor: 100, incomeMinor: 0, txnCount: 1 },
      { categoryId: "food", spentMinor: 200, incomeMinor: 0, txnCount: 2 }
    ];
    const merged = mergeCategoryRollups(rollups);
    expect(merged).toEqual([{ categoryId: "food", spentMinor: 300, incomeMinor: 0, txnCount: 3 }]);
  });

  it("keeps different categories separate", () => {
    const rollups: CategoryRollup[] = [
      { categoryId: "food", spentMinor: 100, incomeMinor: 0, txnCount: 1 },
      { categoryId: "rent", spentMinor: 5000, incomeMinor: 0, txnCount: 1 }
    ];
    const merged = mergeCategoryRollups(rollups);
    expect(merged).toHaveLength(2);
  });

  it("groups every uncategorized entry (no categoryId) into one bucket", () => {
    const rollups: CategoryRollup[] = [
      { spentMinor: 0, incomeMinor: 5000, txnCount: 1 },
      { spentMinor: 0, incomeMinor: 3000, txnCount: 1 }
    ];
    const merged = mergeCategoryRollups(rollups);
    expect(merged).toEqual([{ spentMinor: 0, incomeMinor: 8000, txnCount: 2 }]);
    expect(merged[0]?.categoryId).toBeUndefined();
  });
});

describe("enrichCategoryTotal", () => {
  const category: Category = {
    id: "food",
    userId: "user-a",
    name: "Food",
    kind: "expense",
    icon: "🍔",
    color: "#ff0000",
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("joins a rollup against known category metadata", () => {
    const rollup: CategoryRollup = {
      categoryId: "food",
      spentMinor: 500,
      incomeMinor: 0,
      txnCount: 3
    };
    const result = enrichCategoryTotal(rollup, new Map([["food", category]]));
    expect(result).toEqual({
      categoryId: "food",
      name: "Food",
      icon: "🍔",
      color: "#ff0000",
      amountMinor: 500,
      txnCount: 3
    });
  });

  it("labels an uncategorized rollup without looking anything up", () => {
    const rollup: CategoryRollup = { spentMinor: 100, incomeMinor: 0, txnCount: 1 };
    const result = enrichCategoryTotal(rollup, new Map());
    expect(result.name).toBe("Uncategorized");
    expect(result.categoryId).toBeUndefined();
  });

  it("falls back to Uncategorized if the categoryId no longer resolves to a known category", () => {
    const rollup: CategoryRollup = {
      categoryId: "deleted-id",
      spentMinor: 100,
      incomeMinor: 0,
      txnCount: 1
    };
    const result = enrichCategoryTotal(rollup, new Map());
    expect(result.name).toBe("Uncategorized");
    expect(result.categoryId).toBe("deleted-id");
  });
});
