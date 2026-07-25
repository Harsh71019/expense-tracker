import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const timestamp = "2026-07-16T00:00:00.000Z";
const item = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
  accountName: "Cash",
  type: "expense",
  amountMinor: 4_500,
  description: "Swiggy order",
  occurredAt: timestamp,
  tags: []
};

describe("getRecentActivity", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses recent activity returned by the API", async () => {
    mocks.GET.mockResolvedValue({ data: [item] });
    const { getRecentActivity } = await import("./get-recent-activity");

    await expect(getRecentActivity(5)).resolves.toMatchObject([{ description: "Swiggy order" }]);
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/dashboard/recent-activity",
      expect.objectContaining({ params: { query: { limit: 5 } } })
    );
  });

  it("fails closed for invalid and unavailable responses", async () => {
    mocks.GET.mockResolvedValue({ data: [{ id: "invalid" }] });
    const { getRecentActivity } = await import("./get-recent-activity");
    await expect(getRecentActivity(5)).resolves.toEqual([]);
  });

  it("fails closed when the request throws", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("offline"));
    const { getRecentActivity } = await import("./get-recent-activity");
    await expect(getRecentActivity(5)).resolves.toEqual([]);
  });
});
