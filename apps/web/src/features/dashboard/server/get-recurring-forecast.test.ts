import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));
vi.mock("@/lib/debug", () => ({ debug: { api: mocks.api } }));

const forecast = { range: "1M", inMinor: 500, outMinor: 300, netMinor: 200, upcoming: [] };

describe("getRecurringForecast", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.api.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses the recurring forecast for the given range", async () => {
    mocks.GET.mockResolvedValue({ data: forecast });
    const { getRecurringForecast } = await import("./get-recurring-forecast");

    await expect(getRecurringForecast("1M")).resolves.toMatchObject({ netMinor: 200 });
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/dashboard/recurring-forecast",
      expect.objectContaining({ params: { query: { range: "1M" } } })
    );
  });

  it("fails closed and logs distinctly for invalid responses", async () => {
    mocks.GET.mockResolvedValue({ data: { range: "1M" } });
    const { getRecurringForecast } = await import("./get-recurring-forecast");
    await expect(getRecurringForecast("1M")).resolves.toEqual({
      range: "1M",
      inMinor: 0,
      outMinor: 0,
      netMinor: 0,
      upcoming: []
    });
    expect(mocks.api).toHaveBeenCalled();
  });

  it("fails closed and logs distinctly when the request throws", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("offline"));
    const { getRecurringForecast } = await import("./get-recurring-forecast");
    await expect(getRecurringForecast("1M")).resolves.toMatchObject({ netMinor: 0 });
    expect(mocks.api).toHaveBeenCalled();
  });
});
