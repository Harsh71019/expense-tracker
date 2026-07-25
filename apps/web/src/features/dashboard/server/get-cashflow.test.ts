import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const cashflow = {
  range: "6M",
  buckets: [{ label: "Jul", incomeMinor: 100, expenseMinor: 50 }]
};

describe("getCashflow", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses the cashflow response for the given range", async () => {
    mocks.GET.mockResolvedValue({ data: cashflow });
    const { getCashflow } = await import("./get-cashflow");

    await expect(getCashflow("6M")).resolves.toMatchObject({ range: "6M" });
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/dashboard/cashflow",
      expect.objectContaining({ params: { query: { range: "6M" } } })
    );
  });

  it("fails closed to an empty bucket list for invalid responses", async () => {
    mocks.GET.mockResolvedValue({ data: { range: "6M", buckets: "not-an-array" } });
    const { getCashflow } = await import("./get-cashflow");
    await expect(getCashflow("6M")).resolves.toEqual({ range: "6M", buckets: [] });
  });

  it("fails closed when the request throws", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("offline"));
    const { getCashflow } = await import("./get-cashflow");
    await expect(getCashflow("1W")).resolves.toEqual({ range: "1W", buckets: [] });
  });
});
