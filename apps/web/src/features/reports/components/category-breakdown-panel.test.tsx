import { render, screen } from "@testing-library/react";
import type { Category, MonthlyRollup } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { CategoryBreakdownPanel } from "./category-breakdown-panel";

const groceries: Category = {
  id: "507f1f77bcf86cd799439011",
  userId: "u1",
  name: "Groceries",
  kind: "expense",
  icon: "🛒",
  color: "#f97316",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const rollup: MonthlyRollup = {
  userId: "u1",
  month: "2026-06",
  byCategory: [
    { categoryId: groceries.id, spentMinor: 75_000, incomeMinor: 0, txnCount: 5 },
    { spentMinor: 25_000, incomeMinor: 0, txnCount: 1 }
  ],
  byAccount: [],
  totalExpenseMinor: 100_000,
  totalIncomeMinor: 0,
  computedAt: new Date("2026-07-01T02:15:00.000Z")
};

describe("CategoryBreakdownPanel", () => {
  it("lists each category with its amount and singular/plural transaction count", () => {
    render(<CategoryBreakdownPanel rollup={rollup} categories={[groceries]} />);

    expect(screen.getByText("Groceries")).toBeVisible();
    expect(screen.getByText("₹750.00")).toBeVisible();
    expect(screen.getByText("5 txns")).toBeVisible();
    expect(screen.getByText("Uncategorized")).toBeVisible();
    expect(screen.getByText("1 txn")).toBeVisible();
  });
});
