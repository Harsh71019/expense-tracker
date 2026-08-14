import { render, screen, within } from "@testing-library/react";
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
  },
  twelveMonthForecast: {
    forecastMonths: 12,
    transactionCount: 77,
    expenseMinor: 4_060_000,
    incomeMinor: 9_600_000,
    netMinor: 5_540_000,
    monthlyExpenseAverageMinor: 338_333,
    ruleProjections: [
      {
        recurringRuleId: "3fa85f64-5717-4562-b3fc-2c963f66be11",
        description: "Monthly rent",
        type: "expense",
        amountMinor: 250_000,
        occurrenceCount: 12,
        projectedMinor: 3_000_000
      },
      {
        recurringRuleId: "3fa85f64-5717-4562-b3fc-2c963f66be12",
        description: "Weekly subscription",
        type: "expense",
        amountMinor: 20_000,
        occurrenceCount: 53,
        projectedMinor: 1_060_000
      },
      {
        recurringRuleId: "3fa85f64-5717-4562-b3fc-2c963f66be13",
        description: "Salary",
        type: "income",
        amountMinor: 800_000,
        occurrenceCount: 12,
        projectedMinor: 9_600_000
      }
    ]
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
    expect(
      within(screen.getByLabelText("Highest spending category forecast")).getByText("₹2,500.00")
    ).toBeVisible();
    const annualPanel = screen.getByLabelText("12-month recurring cost");
    expect(annualPanel).toBeVisible();
    expect(within(annualPanel).getByText("Recurring commitments")).toBeVisible();
    expect(within(annualPanel).getByText("₹40,600.00")).toBeVisible();
    expect(within(annualPanel).getByText("₹3,383.33")).toBeVisible();
    expect(within(annualPanel).getAllByText("Monthly rent")).toHaveLength(2);
    expect(within(annualPanel).getAllByText("₹30,000.00")).toHaveLength(2);
    expect(
      within(annualPanel).getByRole("progressbar", { name: /Monthly rent share/ })
    ).toHaveValue(3_000_000);
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

  it("explains when there are no active annual expenses", () => {
    render(
      <RecurringStatsCards
        initialStats={{
          ...stats,
          twelveMonthForecast: {
            forecastMonths: 12,
            transactionCount: 0,
            expenseMinor: 0,
            incomeMinor: 0,
            netMinor: 0,
            monthlyExpenseAverageMinor: 0,
            ruleProjections: []
          }
        }}
      />
    );

    expect(
      screen.getByText("No active recurring expenses fall within the next 12 months.")
    ).toBeVisible();
    expect(
      screen.getByText("Add an active expense rule to see its annual cost here.")
    ).toBeVisible();
  });
});
