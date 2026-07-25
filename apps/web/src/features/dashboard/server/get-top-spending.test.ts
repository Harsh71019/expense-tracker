import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const item = { name: "Groceries", amountMinor: 500, txnCount: 4 };

describe("getTopSpending", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses top spending items for the given range and limit", async () => {
    mocks.GET.mockResolvedValue({ data: [item] });
    const { getTopSpending } = await import("./get-top-spending");

    await expect(getTopSpending("1M", 6)).resolves.toMatchObject([{ name: "Groceries" }]);
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/dashboard/top-spending",
      expect.objectContaining({ params: { query: { range: "1M", limit: 6 } } })
    );
  });

  it("fails closed for invalid and unavailable responses", async () => {
    mocks.GET.mockResolvedValue({ data: [{ name: "Bad" }] });
    const { getTopSpending } = await import("./get-top-spending");
    await expect(getTopSpending("1M", 6)).resolves.toEqual([]);
  });

  it("fails closed when the request throws", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("offline"));
    const { getTopSpending } = await import("./get-top-spending");
    await expect(getTopSpending("1M", 6)).resolves.toEqual([]);
  });
});
