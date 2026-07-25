import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const spendMix = {
  range: "1M",
  totalMinor: 100,
  essential: { amountMinor: 60, pct: 60 },
  lifestyle: { amountMinor: 40, pct: 40 },
  uncategorized: { amountMinor: 0, pct: 0 }
};

describe("getSpendMix", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses the spend mix response for the given range", async () => {
    mocks.GET.mockResolvedValue({ data: spendMix });
    const { getSpendMix } = await import("./get-spend-mix");

    await expect(getSpendMix("1M")).resolves.toMatchObject({ totalMinor: 100 });
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/dashboard/spend-mix",
      expect.objectContaining({ params: { query: { range: "1M" } } })
    );
  });

  it("fails closed to an all-zero mix for invalid responses", async () => {
    mocks.GET.mockResolvedValue({ data: { range: "1M" } });
    const { getSpendMix } = await import("./get-spend-mix");
    await expect(getSpendMix("1M")).resolves.toEqual({
      range: "1M",
      totalMinor: 0,
      essential: { amountMinor: 0, pct: 0 },
      lifestyle: { amountMinor: 0, pct: 0 },
      uncategorized: { amountMinor: 0, pct: 0 }
    });
  });

  it("fails closed when the request throws", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("offline"));
    const { getSpendMix } = await import("./get-spend-mix");
    await expect(getSpendMix("12M")).resolves.toMatchObject({ range: "12M", totalMinor: 0 });
  });
});
