import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const stats = {
  period: "2026-07",
  spent: { valueMinor: 100, deltaPct: -5, trend: [120, 110, 100] },
  income: { valueMinor: 500, deltaPct: 5, trend: [480, 490, 500] },
  savingsRate: { valuePct: 30, deltaPct: 2, trend: [28, 29, 30] },
  netWorth: { valueMinor: 10_000, deltaPct: 1, trend: [9900, 9950, 10000] }
};

describe("getStats", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses stats returned by the API", async () => {
    mocks.GET.mockResolvedValue({ data: stats });
    const { getStats } = await import("./get-stats");

    await expect(getStats()).resolves.toMatchObject({ period: "2026-07" });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/dashboard/stats");
  });

  it("fails closed for invalid and unavailable responses", async () => {
    mocks.GET.mockResolvedValue({ data: { period: "invalid" } });
    const { getStats } = await import("./get-stats");
    await expect(getStats()).resolves.toBeNull();
  });

  it("fails closed when the request throws", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("offline"));
    const { getStats } = await import("./get-stats");
    await expect(getStats()).resolves.toBeNull();
  });
});
