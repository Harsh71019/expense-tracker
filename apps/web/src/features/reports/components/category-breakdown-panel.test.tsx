import { render, screen, within } from "@testing-library/react";
import { buildCategoryRollupNodes, type MonthlyReport } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { CategoryBreakdownPanel } from "./category-breakdown-panel";

const TRANSPORT = "00000000-0000-4000-8000-000000000001";
const CAB = "00000000-0000-4000-8000-000000000002";
const UBER = "00000000-0000-4000-8000-000000000003";
const OLD = "00000000-0000-4000-8000-000000000004";

const consumptionByCategory = [
  { categoryId: TRANSPORT, spentMinor: 10_000, incomeMinor: 0, txnCount: 1 },
  { categoryId: CAB, spentMinor: 20_000, incomeMinor: 0, txnCount: 1 },
  { categoryId: UBER, spentMinor: 50_000, incomeMinor: 0, txnCount: 2 },
  { categoryId: OLD, spentMinor: 5_000, incomeMinor: 0, txnCount: 1 },
  { spentMinor: 25_000, incomeMinor: 0, txnCount: 1 }
];

const rollup: MonthlyReport = {
  userId: "u1",
  month: "2026-06",
  byCategory: consumptionByCategory,
  byAccount: [],
  totalExpenseMinor: 110_000,
  totalIncomeMinor: 0,
  totalCashOutflowMinor: 110_000,
  totalConsumptionMinor: 110_000,
  totalAssetFundingMinor: 0,
  consumptionByCategory,
  consumptionTree: buildCategoryRollupNodes(
    [
      { id: TRANSPORT, name: "Transportation", icon: "T", color: "#f97316", isArchived: false },
      { id: CAB, parentId: TRANSPORT, name: "Cab", isArchived: false },
      { id: UBER, parentId: CAB, name: "Uber", isArchived: false },
      { id: OLD, parentId: TRANSPORT, name: "Old taxi", isArchived: true }
    ],
    consumptionByCategory
  ),
  formulaVersion: 2,
  computedAt: new Date("2026-07-01T02:15:00.000Z")
};

describe("CategoryBreakdownPanel", () => {
  it("lists each root with its rolled-up amount and singular/plural transaction count", () => {
    render(<CategoryBreakdownPanel rollup={rollup} />);

    expect(screen.getByText("Transportation")).toBeVisible();
    expect(screen.getByText("₹850.00")).toBeVisible();
    expect(screen.getByText("5 txns")).toBeVisible();
    expect(screen.getByText("Uncategorized")).toBeVisible();
    expect(screen.getByText("1 txn")).toBeVisible();
  });

  it("shows three levels and an archived child beneath the parent", () => {
    render(<CategoryBreakdownPanel rollup={rollup} />);

    const breakdown = within(screen.getByRole("list", { name: "Transportation breakdown" }));
    expect(breakdown.getByText("Cab")).toBeVisible();
    expect(breakdown.getByText("₹700.00")).toBeVisible();
    expect(breakdown.getByText("Cab (direct)")).toBeVisible();
    expect(breakdown.getByText("Uber")).toBeVisible();
    expect(breakdown.getByText("₹500.00")).toBeVisible();
    expect(breakdown.getByText("Old taxi")).toBeVisible();
    expect(breakdown.getByText("archived")).toBeVisible();
    expect(breakdown.getByText("Transportation (direct)")).toBeVisible();
  });
});
