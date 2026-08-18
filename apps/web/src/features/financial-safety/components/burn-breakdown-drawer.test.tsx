import { fireEvent, render, screen } from "@testing-library/react";
import type { EssentialBurnResponse } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { BurnBreakdownDrawer } from "./burn-breakdown-drawer";

const FIXTURE: EssentialBurnResponse = {
  computedAt: new Date("2026-08-18T10:00:00.000Z"),
  asOf: new Date("2026-08-18T10:00:00.000Z"),
  sourceThrough: new Date("2026-08-18T10:00:00.000Z"),
  formulaVersion: 1,
  timezone: "Asia/Kolkata",
  requiredCompleteMonths: 3,
  observedCompleteMonthCount: 2,
  averageMonthlyEssentialMinor: 25_000,
  quality: "limited",
  completeMonths: [
    {
      month: "2026-05",
      observation: "observed",
      essentialTotalMinor: 20_000,
      eligibleExpenseTransactionCount: 4,
      essentialTransactionCount: 2
    },
    {
      month: "2026-06",
      observation: "missing_history",
      essentialTotalMinor: 0,
      eligibleExpenseTransactionCount: 0,
      essentialTransactionCount: 0
    },
    {
      month: "2026-07",
      observation: "observed",
      essentialTotalMinor: 30_000,
      eligibleExpenseTransactionCount: 6,
      essentialTransactionCount: 3
    }
  ],
  currentPartialMonth: {
    month: "2026-08",
    essentialTotalMinor: 10_000,
    eligibleExpenseTransactionCount: 2,
    essentialTransactionCount: 1,
    excludedFromBaseline: true
  },
  classification: {
    eligibleExpenseTransactionCount: 10,
    essentialExpenseTransactionCount: 5,
    lifestyleExpenseTransactionCount: 4,
    uncategorizedExpenseCount: 1,
    uncategorizedExpenseMinor: 5_000,
    ungroupedExpenseCount: 0,
    ungroupedExpenseMinor: 0,
    categorizedExpenseMinor: 50_000,
    unclassifiedExpenseMinor: 5_000,
    coverageRatioBps: 9090,
    currentCategoryMetadataInUse: true
  },
  limitations: [
    "current_category_metadata_in_use",
    "insufficient_history",
    "uncategorized_expenses_present"
  ]
};

describe("BurnBreakdownDrawer", () => {
  it("renders null when open is false or data is null", () => {
    const { container: closedContainer } = render(
      <BurnBreakdownDrawer open={false} onClose={vi.fn()} data={FIXTURE} />
    );
    expect(closedContainer).toBeEmptyDOMElement();

    const { container: nullDataContainer } = render(
      <BurnBreakdownDrawer open={true} onClose={vi.fn()} data={null} />
    );
    expect(nullDataContainer).toBeEmptyDOMElement();
  });

  it("renders complete months timeline, current month exclusion, and classification evidence", () => {
    const onClose = vi.fn();
    render(<BurnBreakdownDrawer open={true} onClose={onClose} data={FIXTURE} />);

    expect(screen.getByText("Essential Monthly Burn")).toBeInTheDocument();
    expect(screen.getByText("₹250.00")).toBeInTheDocument(); // 25,000 paise = ₹250.00
    expect(screen.getByText("Limited")).toBeInTheDocument();

    // 3 Candidate Months
    expect(screen.getByText("May 2026")).toBeInTheDocument();
    expect(screen.getByText("₹200.00")).toBeInTheDocument();
    expect(screen.getByText("Jun 2026")).toBeInTheDocument();
    expect(screen.getByText("Missing history")).toBeInTheDocument();
    expect(screen.getByText("Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("₹300.00")).toBeInTheDocument();

    // Current Partial Month
    expect(screen.getByText("Current Partial Month")).toBeInTheDocument();
    expect(screen.getByText("Excluded from baseline")).toBeInTheDocument();
    expect(screen.getByText("Aug 2026 (Month-to-date)")).toBeInTheDocument();
    expect(screen.getByText("₹100.00")).toBeInTheDocument();

    // Classification Evidence
    expect(screen.getByText("Classification & Coverage Evidence")).toBeInTheDocument();
    expect(screen.getByText("Essential Transactions")).toBeInTheDocument();
    expect(screen.getByText("Lifestyle Transactions")).toBeInTheDocument();
    expect(screen.getByText("Uncategorized Expenses")).toBeInTheDocument();

    // Close button
    const closeBtn = screen.getByRole("button", { name: "Close essential burn breakdown" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
