import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));
vi.mock("@/lib/debug", () => ({ debug: { api: mocks.api } }));

const response = {
  period: "2026-08",
  asOf: "2026-08-03T06:00:00.000Z",
  totalMinor: 1_500,
  daily: [{ date: "2026-07-31T18:30:00.000Z", amountMinor: 1_500 }],
  weekly: [
    {
      startAt: "2026-07-31T18:30:00.000Z",
      endAt: "2026-08-02T18:30:00.000Z",
      amountMinor: 1_500
    }
  ]
};

describe("getMonthlySpending", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.api.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses the current-month spending response", async () => {
    mocks.GET.mockResolvedValue({ data: response });
    const { getMonthlySpending } = await import("./get-monthly-spending");

    await expect(getMonthlySpending()).resolves.toMatchObject({
      period: "2026-08",
      totalMinor: 1_500
    });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/dashboard/monthly-spending");
  });

  it("fails closed for an invalid response", async () => {
    mocks.GET.mockResolvedValue({ data: { ...response, daily: "invalid" } });
    const { getMonthlySpending } = await import("./get-monthly-spending");

    await expect(getMonthlySpending()).resolves.toBeNull();
    expect(mocks.api).toHaveBeenCalled();
  });

  it("fails closed when the request throws", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("offline"));
    const { getMonthlySpending } = await import("./get-monthly-spending");

    await expect(getMonthlySpending()).resolves.toBeNull();
    expect(mocks.api).toHaveBeenCalled();
  });
});
