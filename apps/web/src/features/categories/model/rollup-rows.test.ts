import type { CategoryRollupNode } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { rollupRowsBeneath } from "./rollup-rows";

const TRANSPORT = "00000000-0000-4000-8000-000000000001";
const CAB = "00000000-0000-4000-8000-000000000002";
const UBER = "00000000-0000-4000-8000-000000000003";

function node(overrides: Partial<CategoryRollupNode> & { name: string }): CategoryRollupNode {
  return {
    depth: 0,
    isArchived: false,
    directSpentMinor: 0,
    directIncomeMinor: 0,
    directTxnCount: 0,
    totalSpentMinor: 0,
    totalIncomeMinor: 0,
    totalTxnCount: 0,
    ...overrides
  };
}

const root = node({
  categoryId: TRANSPORT,
  name: "Transportation",
  directSpentMinor: 100,
  totalSpentMinor: 800
});
const cab = node({
  categoryId: CAB,
  parentCategoryId: TRANSPORT,
  depth: 1,
  name: "Cab",
  directSpentMinor: 200,
  totalSpentMinor: 700
});
const uber = node({
  categoryId: UBER,
  parentCategoryId: CAB,
  depth: 2,
  name: "Uber",
  directSpentMinor: 500,
  totalSpentMinor: 500,
  isArchived: true
});

describe("rollupRowsBeneath", () => {
  it("lists descendants and direct rows that add up at each level", () => {
    const rows = rollupRowsBeneath(root, [cab, uber]);
    expect(rows.map((row) => [row.name, row.depth, row.amountMinor])).toEqual([
      ["Transportation (direct)", 1, 100],
      ["Cab", 1, 700],
      ["Cab (direct)", 2, 200],
      ["Uber", 2, 500]
    ]);
    expect(rows[3]?.isArchived).toBe(true);
  });

  it("shows nothing beneath a category with no subcategory spend", () => {
    expect(rollupRowsBeneath({ ...root, directSpentMinor: 800 }, [])).toEqual([]);
  });

  it("hides income-only descendants and the direct row they would imply", () => {
    const incomeOnly = node({
      categoryId: CAB,
      parentCategoryId: TRANSPORT,
      depth: 1,
      name: "Refunds",
      totalIncomeMinor: 50
    });
    expect(rollupRowsBeneath({ ...root, directSpentMinor: 800 }, [incomeOnly])).toEqual([]);
  });
});
