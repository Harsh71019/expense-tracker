import { render, screen } from "@testing-library/react";
import type { MonthlySpending } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { MonthlySpendingPanel } from "./monthly-spending-panel";

const spending: MonthlySpending = {
  period: "2026-08",
  asOf: new Date("2026-08-03T06:00:00.000Z"),
  totalMinor: 12_500,
  daily: Array.from({ length: 31 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 6, 31, 18, 30) + index * 24 * 60 * 60 * 1000),
    amountMinor: index < 3 ? (index + 1) * 1_000 : 0
  })),
  weekly: [
    {
      startAt: new Date("2026-07-31T18:30:00.000Z"),
      endAt: new Date("2026-08-02T18:30:00.000Z"),
      amountMinor: 12_500
    }
  ]
};

describe("MonthlySpendingPanel", () => {
  it("renders the month-to-date card and both charts", () => {
    render(<MonthlySpendingPanel spending={spending} />);

    expect(screen.getByRole("heading", { name: "This month's spending rhythm" })).toBeVisible();
    expect(screen.getByText("₹125.00")).toBeVisible();
    expect(screen.getByText("3 OF 31 DAYS ELAPSED")).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Weekly spending for the current month" })
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Daily spending across 31 days in the current month" })
    ).toBeVisible();
  });

  it("keeps both chart regions understandable before any spending is posted", () => {
    render(
      <MonthlySpendingPanel spending={{ ...spending, totalMinor: 0, daily: [], weekly: [] }} />
    );

    expect(screen.getByText("No spending yet.")).toBeVisible();
    expect(screen.getByText("No calendar data yet.")).toBeVisible();
  });
});
