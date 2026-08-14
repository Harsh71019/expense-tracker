import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const netWorth = {
  asOf: "2026-01-01T00:00:00.000Z",
  netWorthMinor: 500_000,
  accounts: [],
  assets: []
};

describe("getNetWorth", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses the net worth returned by the API", async () => {
    mocks.GET.mockResolvedValue({ data: netWorth });
    const { getNetWorth } = await import("./get-net-worth");

    await expect(getNetWorth()).resolves.toMatchObject({ netWorthMinor: 500_000 });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/net-worth");
  });

  it("fails closed to null for an invalid response", async () => {
    mocks.GET.mockResolvedValue({ data: { netWorthMinor: "not-a-number" } });
    const { getNetWorth } = await import("./get-net-worth");

    await expect(getNetWorth()).resolves.toBeNull();
  });

  it("fails closed to null when the request throws", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("offline"));
    const { getNetWorth } = await import("./get-net-worth");

    await expect(getNetWorth()).resolves.toBeNull();
  });
});
