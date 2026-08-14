import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRecurringStats } from "./get-recurring-stats";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn(), api: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));
vi.mock("@/lib/debug", () => ({ debug: { api: mocks.api } }));

const response = {
  forecastDays: 30,
  totalRules: 2,
  activeRules: 1,
  pausedRules: 1,
  upcomingTransactionCount: 1,
  upcomingExpenseMinor: 250_000,
  upcomingIncomeMinor: 0,
  upcomingNetMinor: -250_000,
  topSpendingCategory: null,
  twelveMonthForecast: {
    forecastMonths: 12,
    transactionCount: 12,
    expenseMinor: 3_000_000,
    incomeMinor: 0,
    netMinor: -3_000_000,
    monthlyExpenseAverageMinor: 250_000,
    ruleProjections: []
  }
};

describe("getRecurringStats", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.api.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("loads and validates recurring stats", async () => {
    mocks.GET.mockResolvedValue({ data: response });

    await expect(getRecurringStats()).resolves.toMatchObject({ totalRules: 2 });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/recurring/stats");
  });

  it("returns null when the endpoint response is invalid", async () => {
    mocks.GET.mockResolvedValue({ data: { forecastDays: 14 } });

    await expect(getRecurringStats()).resolves.toBeNull();
    expect(mocks.api).toHaveBeenCalled();
  });
});
