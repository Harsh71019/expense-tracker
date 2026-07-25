import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const timestamp = "2026-07-16T00:00:00.000Z";
const item = {
  assetId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  name: "Nifty 50 Index",
  kind: "investment",
  currentValueMinor: 1000,
  returnPct: 12.5,
  series: [{ valuedAt: timestamp, valueMinor: 1000 }]
};

describe("getInvestments", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses investments returned by the API", async () => {
    mocks.GET.mockResolvedValue({ data: { items: [item] } });
    const { getInvestments } = await import("./get-investments");

    await expect(getInvestments()).resolves.toMatchObject({ items: [{ name: "Nifty 50 Index" }] });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/dashboard/investments");
  });

  it("fails closed to an empty list for invalid responses", async () => {
    mocks.GET.mockResolvedValue({ data: { items: [{ name: "Bad" }] } });
    const { getInvestments } = await import("./get-investments");
    await expect(getInvestments()).resolves.toEqual({ items: [] });
  });

  it("fails closed when the request throws", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("offline"));
    const { getInvestments } = await import("./get-investments");
    await expect(getInvestments()).resolves.toEqual({ items: [] });
  });
});
