import { render, screen } from "@testing-library/react";
import { buildCategoryRollupNodes, type MonthlyReport } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { SpendByCategoryPanel } from "./spend-by-category-panel";

const GROCERIES = "00000000-0000-4000-8000-000000000001";
const BLINKIT = "00000000-0000-4000-8000-000000000002";
const IDLE = "00000000-0000-4000-8000-000000000003";

const consumptionByCategory = [
  { categoryId: GROCERIES, spentMinor: 25_000, incomeMinor: 0, txnCount: 2 },
  { categoryId: BLINKIT, spentMinor: 50_000, incomeMinor: 0, txnCount: 3 },
  { spentMinor: 25_000, incomeMinor: 0, txnCount: 2 },
  { categoryId: IDLE, spentMinor: 0, incomeMinor: 0, txnCount: 0 }
];

const rollup: MonthlyReport = {
  userId: "u1",
  month: "2026-06",
  byCategory: consumptionByCategory,
  byAccount: [],
  totalExpenseMinor: 100_000,
  totalIncomeMinor: 0,
  totalCashOutflowMinor: 100_000,
  totalConsumptionMinor: 100_000,
  totalAssetFundingMinor: 0,
  consumptionByCategory,
  consumptionTree: buildCategoryRollupNodes(
    [
      { id: GROCERIES, name: "Groceries", icon: "G", color: "#f97316", isArchived: false },
      { id: BLINKIT, parentId: GROCERIES, name: "Blinkit", isArchived: false },
      { id: IDLE, name: "Idle", isArchived: false }
    ],
    consumptionByCategory
  ),
  formulaVersion: 2,
  computedAt: new Date("2026-07-01T02:15:00.000Z")
};

describe("SpendByCategoryPanel", () => {
  it("shares spend across roots only, so the legend adds up to 100%", () => {
    render(<SpendByCategoryPanel rollup={rollup} />);

    expect(screen.getByText("Groceries")).toBeVisible();
    expect(screen.getByText("75%")).toBeVisible();
    expect(screen.getByText("Uncategorized")).toBeVisible();
    expect(screen.getByText("25%")).toBeVisible();
    expect(screen.queryByText("Blinkit")).not.toBeInTheDocument();
    expect(screen.queryByText("Idle")).not.toBeInTheDocument();
  });
});
