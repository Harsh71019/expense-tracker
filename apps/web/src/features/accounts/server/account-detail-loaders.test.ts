import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn(), api: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));
vi.mock("@/lib/debug", () => ({ debug: { api: mocks.api } }));

const accountId = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const account = {
  id: accountId,
  userId: "user-1",
  name: "HDFC",
  type: "bank",
  currency: "INR",
  openingBalanceMinor: 100_000,
  balanceMinor: 120_000,
  isArchived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z"
};
const insights = {
  range: "30d",
  from: "2026-07-25T18:30:00.000Z",
  to: "2026-08-24T18:29:59.999Z",
  bucket: "day",
  summary: { incomeMinor: 30_000, expenseMinor: 10_000, netMinor: 20_000, transactionCount: 2 },
  balanceSeries: [{ period: "2026-08-23", balanceMinor: 120_000 }],
  cashflowSeries: [{ period: "2026-08-23", incomeMinor: 30_000, expenseMinor: 10_000 }],
  spendingByCategory: []
};

describe("account detail server loaders", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.api.mockReset();
    mocks.getServerApiClient.mockReset().mockResolvedValue({ GET: mocks.GET });
  });

  it("loads and validates the account and selected insights range", async () => {
    mocks.GET.mockResolvedValueOnce({ data: account }).mockResolvedValueOnce({ data: insights });
    const [{ getAccount }, { getAccountInsights }] = await Promise.all([
      import("./get-account"),
      import("./get-account-insights")
    ]);

    await expect(getAccount(accountId)).resolves.toMatchObject({ name: "HDFC" });
    await expect(getAccountInsights(accountId, "30d")).resolves.toMatchObject({ range: "30d" });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/accounts/{accountId}", {
      params: { path: { accountId } }
    });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/accounts/{accountId}/insights", {
      params: { path: { accountId }, query: { range: "30d" } }
    });
  });

  it("fails closed when either response is malformed or unavailable", async () => {
    mocks.GET.mockResolvedValue({ data: { id: "invalid" } });
    const [{ getAccount }, { getAccountInsights }] = await Promise.all([
      import("./get-account"),
      import("./get-account-insights")
    ]);

    await expect(getAccount(accountId)).resolves.toBeNull();
    await expect(getAccountInsights(accountId, "all")).resolves.toBeNull();
    expect(mocks.api).toHaveBeenCalled();
  });
});
