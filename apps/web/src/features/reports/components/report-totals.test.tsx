import { render, screen } from "@testing-library/react";
import type { MonthlyRollup } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { ReportTotals } from "./report-totals";

function rollup(overrides: Partial<MonthlyRollup> = {}): MonthlyRollup {
  return {
    userId: "u1",
    month: "2026-06",
    byCategory: [
      { categoryId: "507f1f77bcf86cd799439011", spentMinor: 100_000, incomeMinor: 0, txnCount: 5 },
      { spentMinor: 50_000, incomeMinor: 0, txnCount: 2 }
    ],
    byAccount: [],
    totalExpenseMinor: 150_000,
    totalIncomeMinor: 850_000,
    totalCashOutflowMinor: 150_000,
    totalConsumptionMinor: 150_000,
    totalAssetFundingMinor: 0,
    consumptionByCategory: [
      { categoryId: "507f1f77bcf86cd799439011", spentMinor: 100_000, incomeMinor: 0, txnCount: 5 },
      { spentMinor: 50_000, incomeMinor: 0, txnCount: 2 }
    ],
    formulaVersion: 2,
    computedAt: new Date("2026-07-01T02:15:00.000Z"),
    ...overrides
  };
}

describe("ReportTotals", () => {
  it("shows spend, income, and a positive net-flow message when saving", () => {
    render(<ReportTotals rollup={rollup()} />);

    expect(screen.getByText("CONSUMPTION")).toBeVisible();
    expect(screen.getAllByText("₹1,500.00")).toHaveLength(2);
    expect(screen.getByText("7 transactions")).toBeVisible();
    expect(screen.getByText("RECEIVED")).toBeVisible();
    expect(screen.getByText("₹8,500.00")).toBeVisible();
    expect(screen.getByText("+₹7,000.00")).toBeVisible();
    expect(screen.getByText("after consumption")).toBeVisible();
  });

  it("shows an overspent message when expenses exceed income", () => {
    render(
      <ReportTotals
        rollup={rollup({
          totalExpenseMinor: 900_000,
          totalCashOutflowMinor: 900_000,
          totalConsumptionMinor: 900_000,
          totalIncomeMinor: 850_000
        })}
      />
    );
    expect(screen.getByText("consumption exceeded income")).toBeVisible();
  });

  it("singularises a single-transaction month", () => {
    render(
      <ReportTotals
        rollup={{
          ...rollup({ byCategory: [{ spentMinor: 100, incomeMinor: 0, txnCount: 1 }] }),
          consumptionByCategory: [{ spentMinor: 100, incomeMinor: 0, txnCount: 1 }]
        }}
      />
    );
    expect(screen.getByText("1 transaction")).toBeVisible();
  });
});
