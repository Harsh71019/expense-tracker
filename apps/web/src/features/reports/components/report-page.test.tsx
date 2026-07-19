import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account, Category, MonthlyRollup } from "@vyaya/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportPage } from "./report-page";

const mocks = vi.hoisted(() => {
  const rollupsByMonth = new Map<string, MonthlyRollup | null>();
  return { rollupsByMonth, isLoading: false };
});

vi.mock("../hooks/use-monthly-rollup", () => ({
  useMonthlyRollup: (month: string) => ({
    data: mocks.rollupsByMonth.get(month),
    isLoading: mocks.isLoading
  })
}));
vi.mock("@/features/accounts", (): { useAccounts: () => { data: Account[] } } => ({
  useAccounts: () => ({ data: [] })
}));
vi.mock("@/features/categories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/categories")>();
  return { ...actual, useCategories: () => ({ data: [] satisfies Category[] }) };
});

function rollup(month: string): MonthlyRollup {
  return {
    userId: "u1",
    month,
    byCategory: [{ spentMinor: 100_000, incomeMinor: 0, txnCount: 3 }],
    byAccount: [],
    totalExpenseMinor: 100_000,
    totalIncomeMinor: 200_000,
    computedAt: new Date("2026-07-01T02:15:00.000Z")
  };
}

describe("ReportPage", () => {
  beforeEach(() => {
    mocks.rollupsByMonth.clear();
    mocks.isLoading = false;
  });

  it("shows the full report body when a rollup is available", () => {
    mocks.rollupsByMonth.set("2026-06", rollup("2026-06"));
    render(<ReportPage initialMonth="2026-06" initialRollup={rollup("2026-06")} />);

    expect(screen.getByRole("heading", { name: "Monthly report" })).toBeVisible();
    expect(screen.getByText("SPENT")).toBeVisible();
    expect(screen.getByText("Spend by category")).toBeVisible();
    expect(screen.getByText("Category breakdown")).toBeVisible();
    expect(screen.getByText("Net flow by account")).toBeVisible();
  });

  it("shows the empty state when there is no rollup for the month", () => {
    mocks.rollupsByMonth.set("2026-06", null);
    render(<ReportPage initialMonth="2026-06" initialRollup={null} />);
    expect(screen.getByText("No rollup for June 2026")).toBeVisible();
  });

  it("shows a loading message while the rollup is in flight", () => {
    mocks.isLoading = true;
    render(<ReportPage initialMonth="2026-06" initialRollup={null} />);
    expect(screen.getByText("Loading…")).toBeVisible();
  });

  it("switches months via the selector and reflects the new rollup", async () => {
    const user = userEvent.setup();
    mocks.rollupsByMonth.set("2026-06", rollup("2026-06"));
    mocks.rollupsByMonth.set("2026-05", null);
    render(<ReportPage initialMonth="2026-06" initialRollup={rollup("2026-06")} />);

    expect(screen.getByText("SPENT")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "May 26" }));
    expect(screen.getByText("No rollup for May 2026")).toBeVisible();
  });
});
