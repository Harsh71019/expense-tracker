import { render, screen } from "@testing-library/react";
import type { DashboardStats } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { StatCards } from "./stat-cards";

const stats: DashboardStats = {
  period: "2026-07",
  spent: { valueMinor: 618_425_00, deltaPct: -8, trend: [700000, 650000, 618425] },
  income: { valueMinor: 920_000_00, deltaPct: 8, trend: [850000, 850000, 920000] },
  savingsRate: { valuePct: 33, deltaPct: null, trend: [28, 30, 33] },
  netWorth: { valueMinor: 197_000_000_00, deltaPct: 4, trend: [168, 178, 197] }
};

describe("StatCards", () => {
  it("renders every stat with a formatted value and delta", () => {
    render(<StatCards stats={stats} />);

    expect(screen.getByText(`SPENT · ${stats.period}`)).toBeVisible();
    expect(screen.getByText(`INCOME · ${stats.period}`)).toBeVisible();
    expect(screen.getByText("SAVINGS RATE")).toBeVisible();
    expect(screen.getByText("NET WORTH")).toBeVisible();
    expect(screen.getByText("33%")).toBeVisible();
    expect(screen.getByText("↓ 8% MoM")).toBeVisible();
    expect(screen.getByText("↑ 8% MoM")).toBeVisible();
    expect(screen.getByText("—")).toBeVisible();
  });

  it("treats a falling spend delta as good and a falling income delta as bad", () => {
    render(
      <StatCards
        stats={{
          ...stats,
          spent: { valueMinor: 100, deltaPct: -10, trend: [110, 100] },
          income: { valueMinor: 100, deltaPct: -10, trend: [110, 100] }
        }}
      />
    );

    const deltas = screen.getAllByText("↓ 10% MoM");
    expect(deltas[0]).toHaveClass("text-income");
    expect(deltas[1]).toHaveClass("text-expense");
  });
});
