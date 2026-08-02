import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTransactionInsights } from "./get-transaction-insights";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn(), api: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));
vi.mock("@/lib/debug", () => ({ debug: { api: mocks.api } }));

const response = {
  month: "2026-08",
  monthlyTransactionCount: 1,
  dailyActivity: [{ date: "2026-08-01", transactionCount: 1 }],
  highestExpense: null,
  topSpendingCategory: null,
  lifetimeTransactionCount: 10
};

describe("getTransactionInsights", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.api.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("loads and validates transaction insights", async () => {
    mocks.GET.mockResolvedValue({ data: response });

    await expect(getTransactionInsights()).resolves.toMatchObject({
      month: "2026-08",
      lifetimeTransactionCount: 10
    });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/transactions/insights");
  });

  it("returns null when the endpoint response is invalid", async () => {
    mocks.GET.mockResolvedValue({ data: { month: "invalid" } });

    await expect(getTransactionInsights()).resolves.toBeNull();
    expect(mocks.api).toHaveBeenCalled();
  });
});
