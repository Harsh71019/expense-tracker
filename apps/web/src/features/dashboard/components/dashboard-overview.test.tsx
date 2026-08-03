import { render, screen } from "@testing-library/react";
import type {
  CashflowResponse,
  DashboardInvestments,
  DashboardStats,
  MonthlySpending,
  RecurringForecast,
  SpendMix,
  TopSpendingItem
} from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { DashboardOverview } from "./dashboard-overview";

const mocks = vi.hoisted(() => ({
  useStats: vi.fn(),
  useMonthlySpending: vi.fn(),
  useInvestments: vi.fn(),
  useCashflow: vi.fn(),
  useSpendMix: vi.fn(),
  useTopSpending: vi.fn(),
  useRecurringForecast: vi.fn()
}));
vi.mock("../hooks/use-stats", () => ({ useStats: mocks.useStats }));
vi.mock("../hooks/use-monthly-spending", () => ({
  useMonthlySpending: mocks.useMonthlySpending
}));
vi.mock("../hooks/use-investments", () => ({ useInvestments: mocks.useInvestments }));
vi.mock("../hooks/use-cashflow", () => ({ useCashflow: mocks.useCashflow }));
vi.mock("../hooks/use-spend-mix", () => ({ useSpendMix: mocks.useSpendMix }));
vi.mock("../hooks/use-top-spending", () => ({ useTopSpending: mocks.useTopSpending }));
vi.mock("../hooks/use-recurring-forecast", () => ({
  useRecurringForecast: mocks.useRecurringForecast
}));
vi.mock("@/features/reports/components/pie-chart", () => ({
  PieChart: () => <svg role="img" aria-label="pie" />
}));

const stats: DashboardStats = {
  period: "2026-07",
  spent: { valueMinor: 100, deltaPct: -5, trend: [120, 110, 100] },
  income: { valueMinor: 500, deltaPct: 5, trend: [480, 490, 500] },
  savingsRate: { valuePct: 30, deltaPct: 2, trend: [28, 29, 30] },
  netWorth: { valueMinor: 10_000, deltaPct: 1, trend: [9900, 9950, 10000] }
};
const cashflow: CashflowResponse = { range: "6M", buckets: [] };
const monthlySpending: MonthlySpending = {
  period: "2026-07",
  asOf: new Date("2026-07-15T06:00:00.000Z"),
  totalMinor: 6_000,
  daily: [{ date: new Date("2026-06-30T18:30:00.000Z"), amountMinor: 6_000 }],
  weekly: [
    {
      startAt: new Date("2026-06-30T18:30:00.000Z"),
      endAt: new Date("2026-07-06T18:30:00.000Z"),
      amountMinor: 6_000
    }
  ]
};
const spendMix: SpendMix = {
  range: "1M",
  totalMinor: 0,
  essential: { amountMinor: 0, pct: 0 },
  lifestyle: { amountMinor: 0, pct: 0 },
  uncategorized: { amountMinor: 0, pct: 0 }
};
const topSpending: TopSpendingItem[] = [];
const recurringForecast: RecurringForecast = {
  range: "1M",
  inMinor: 0,
  outMinor: 0,
  netMinor: 0,
  upcoming: []
};
const investments: DashboardInvestments = { items: [] };

function setup(overrideStats: DashboardStats | null = stats): void {
  mocks.useStats.mockReturnValue({ data: overrideStats });
  mocks.useMonthlySpending.mockReturnValue({ data: monthlySpending });
  mocks.useInvestments.mockReturnValue({ data: investments });
  mocks.useCashflow.mockReturnValue({ data: undefined });
  mocks.useSpendMix.mockReturnValue({ data: undefined });
  mocks.useTopSpending.mockReturnValue({ data: undefined });
  mocks.useRecurringForecast.mockReturnValue({ data: undefined });
}

describe("DashboardOverview", () => {
  it("renders the page title and every panel", () => {
    setup();
    render(
      <DashboardOverview
        initialStats={stats}
        initialMonthlySpending={monthlySpending}
        initialCashflow={cashflow}
        initialSpendMix={spendMix}
        initialTopSpending={topSpending}
        initialRecurringForecast={recurringForecast}
        initialInvestments={investments}
        initialBudgets={null}
      />
    );

    expect(screen.getByRole("heading", { name: "Financial overview" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Cash flow" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "This month's spending rhythm" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Spend mix" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Top spending" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Recurring commitments" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Investments & deposits" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Monthly budgets" })).toBeVisible();
    expect(screen.getByText(`SPENT · ${stats.period}`)).toBeVisible();
  });

  it("omits the stat cards when stats could not be loaded", () => {
    setup(null);
    render(
      <DashboardOverview
        initialStats={null}
        initialMonthlySpending={monthlySpending}
        initialCashflow={cashflow}
        initialSpendMix={spendMix}
        initialTopSpending={topSpending}
        initialRecurringForecast={recurringForecast}
        initialInvestments={investments}
        initialBudgets={null}
      />
    );

    expect(screen.queryByText(/SPENT ·/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Financial overview" })).toBeVisible();
  });
});
