import type { CategoryRollupNode } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { rollupCategoryMeta, rootsWithSpend } from "./rollup-category";

const bare: CategoryRollupNode = {
  depth: 0,
  name: "Groceries",
  isArchived: false,
  directSpentMinor: 100,
  directIncomeMinor: 0,
  directTxnCount: 1,
  totalSpentMinor: 100,
  totalIncomeMinor: 0,
  totalTxnCount: 1
};
const groceries: CategoryRollupNode = {
  ...bare,
  categoryId: "00000000-0000-4000-8000-000000000001",
  icon: "🛒",
  color: "#f97316"
};

describe("rollupCategoryMeta", () => {
  it("treats an absent categoryId as the Uncategorized bucket", () => {
    expect(rollupCategoryMeta({ ...bare, name: "Uncategorized" })).toEqual({
      name: "Uncategorized",
      icon: "∅",
      color: "#71817a"
    });
  });

  it("uses the node's name, icon, and colour, including for an archived category", () => {
    expect(rollupCategoryMeta({ ...groceries, isArchived: true })).toEqual({
      name: "Groceries",
      icon: "🛒",
      color: "#f97316"
    });
  });

  it("falls back to the first-letter glyph and neutral colour", () => {
    const { categoryId } = groceries;
    if (categoryId === undefined) throw new Error("Fixture needs a category id.");
    expect(rollupCategoryMeta({ ...bare, categoryId })).toEqual({
      name: "Groceries",
      icon: "G",
      color: "#71817a"
    });
  });
});

describe("rootsWithSpend", () => {
  it("keeps only depth-0 categories that spent money", () => {
    const child = { ...groceries, depth: 1, name: "Blinkit" };
    const income = { ...groceries, name: "Salary", totalSpentMinor: 0, directSpentMinor: 0 };
    expect(rootsWithSpend([groceries, child, income])).toEqual([groceries]);
  });
});
