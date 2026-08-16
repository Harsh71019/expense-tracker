import { render, screen } from "@testing-library/react";
import type { TransactionInsights } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TransactionInsightsCards } from "./transaction-insights-cards";

const baseInsights: TransactionInsights = {
  month: "2026-08",
  monthlyTransactionCount: 7,
  dailyActivity: [
    { date: "2026-08-01", transactionCount: 2 },
    { date: "2026-08-02", transactionCount: 5 }
  ],
  highestExpense: {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    description: "Weekly groceries",
    amountMinor: 50_000,
    occurredAt: new Date("2026-08-02T09:00:00.000Z")
  },
  topSpendingCategory: {
    categoryId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
    name: "Food",
    color: "#16a34a",
    icon: "F",
    amountMinor: 75_000,
    transactionCount: 4
  },
  lifetimeTransactionCount: 1_234
};

const mocks = vi.hoisted((): { data: TransactionInsights | undefined } => ({ data: undefined }));
vi.mock("../hooks/use-transaction-insights", () => ({
  useTransactionInsights: () => ({ data: mocks.data, isError: false })
}));

describe("TransactionInsightsCards", () => {
  beforeEach(() => {
    mocks.data = baseInsights;
  });

  it("renders the four requested current-month and lifetime metrics", () => {
    render(<TransactionInsightsCards initialInsights={baseInsights} />);

    expect(screen.getByRole("region", { name: "Transaction insights" })).toBeVisible();
    expect(screen.getByText("Monthly activity · Aug 2026")).toBeVisible();
    expect(screen.getByRole("img", { name: /Daily transaction activity: 7/ })).toBeVisible();
    expect(screen.getByText("₹500.00")).toBeVisible();
    expect(screen.getByText("Weekly groceries")).toBeVisible();
    expect(screen.getByText("Food")).toBeVisible();
    expect(screen.getByText("₹750.00")).toBeVisible();
    expect(screen.getByText("1,234")).toBeVisible();
  });

  it("renders a glyph icon for category Lucide icon keys like percent", () => {
    mocks.data = {
      ...baseInsights,
      topSpendingCategory: {
        categoryId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        name: "Investment",
        color: "#22c55e",
        icon: "percent",
        amountMinor: 5_650_000,
        transactionCount: 4
      }
    };

    render(<TransactionInsightsCards initialInsights={mocks.data} />);

    expect(screen.getByText("Investment")).toBeVisible();
    expect(screen.getByText("₹56,500.00")).toBeVisible();
    // Lucide Percent icon renders an svg with aria-hidden, not the raw text "percent"
    expect(screen.queryByText("percent")).not.toBeInTheDocument();
  });

  it("shows directed empty states when the month has no spending", () => {
    mocks.data = {
      ...baseInsights,
      monthlyTransactionCount: 0,
      highestExpense: null,
      topSpendingCategory: null
    };

    render(<TransactionInsightsCards initialInsights={mocks.data} />);

    expect(screen.getByText("No posted expenses this month")).toBeVisible();
    expect(screen.getByText("No category spending this month")).toBeVisible();
  });
});
