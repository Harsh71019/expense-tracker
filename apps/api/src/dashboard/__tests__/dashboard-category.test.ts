import type { CategoryRollup, CategoryRollupNode } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { mergeCategoryRollups, toTopSpendingItem } from "../dashboard-category.js";

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

describe("toTopSpendingItem", () => {
  const node = (overrides: Partial<CategoryRollupNode>): CategoryRollupNode => ({
    depth: 0,
    name: "Food",
    isArchived: false,
    directSpentMinor: 0,
    directIncomeMinor: 0,
    directTxnCount: 0,
    totalSpentMinor: 0,
    totalIncomeMinor: 0,
    totalTxnCount: 0,
    ...overrides
  });

  it("uses the rolled-up total, keeps the direct amount and lists children with spend", () => {
    const child = node({ depth: 1, name: "Snacks", directSpentMinor: 300, totalSpentMinor: 300 });
    const incomeOnlyChild = node({ depth: 1, name: "Refunds", totalIncomeMinor: 40 });
    const result = toTopSpendingItem({
      root: node({
        categoryId: "food",
        icon: "🍔",
        color: "#ff0000",
        directSpentMinor: 200,
        totalSpentMinor: 500,
        totalTxnCount: 3
      }),
      descendants: [child, incomeOnlyChild]
    });
    expect(result).toEqual({
      categoryId: "food",
      name: "Food",
      icon: "🍔",
      color: "#ff0000",
      isArchived: false,
      amountMinor: 500,
      directAmountMinor: 200,
      txnCount: 3,
      children: [child]
    });
  });

  it("omits the id and optional metadata for Uncategorized", () => {
    const result = toTopSpendingItem({
      root: node({ name: "Uncategorized", totalSpentMinor: 100 }),
      descendants: []
    });
    expect(result.categoryId).toBeUndefined();
    expect(result.icon).toBeUndefined();
    expect(result.name).toBe("Uncategorized");
  });
});
