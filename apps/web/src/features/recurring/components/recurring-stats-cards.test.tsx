import { render, screen } from "@testing-library/react";
import type { RecurringStats } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { RecurringStatsCards } from "./recurring-stats-cards";

const stats: RecurringStats = {
  forecastDays: 30,
  totalRules: 4,
  activeRules: 3,
  pausedRules: 1,
  upcomingTransactionCount: 7,
  upcomingExpenseMinor: 350_000,
  upcomingIncomeMinor: 800_000,
  upcomingNetMinor: 450_000,
  topSpendingCategory: {
    name: "Housing",
    amountMinor: 250_000,
    transactionCount: 1
  }
};

vi.mock("../hooks/use-recurring-stats", () => ({
  useRecurringStats: (initialStats: RecurringStats | null) => ({
    data: initialStats ?? undefined,
    isError: false
  })
}));

describe("RecurringStatsCards", () => {
  it("shows rule, forecast, cash-flow, and top-category metrics", () => {
    render(<RecurringStatsCards initialStats={stats} />);

    expect(screen.getByLabelText("Recurring insights")).toBeVisible();
    expect(screen.getByText("Total recurring rules")).toBeVisible();
    expect(screen.getByText("Upcoming transactions · 30 days")).toBeVisible();
    expect(screen.getByText("Forecast cash flow · 30 days")).toBeVisible();
    expect(screen.getByText("Highest spending category · 30 days")).toBeVisible();
    expect(screen.getByText("Housing")).toBeVisible();
    expect(screen.getByText("−₹3,500.00")).toBeVisible();
    expect(screen.getByText("₹2,500.00")).toBeVisible();
  });

  it("handles a forecast with no scheduled expenses", () => {
    render(
      <RecurringStatsCards
        initialStats={{
          ...stats,
          upcomingExpenseMinor: 0,
          topSpendingCategory: null
        }}
      />
    );

    expect(screen.getByText("No scheduled expenses.")).toBeVisible();
  });
});
