import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));
vi.mock("@/lib/debug", () => ({ debug: { api: mocks.api } }));

const timestamp = "2026-07-16T00:00:00.000Z";
const response = {
  items: [
    {
      id: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
      userId: "user-1",
      accountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      type: "expense",
      amountMinor: 2_000,
      occurredAt: timestamp,
      description: "Chai",
      tags: [],
      currency: "INR",
      source: "manual",
      status: "posted",
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ],
  pageInfo: { nextCursor: null, hasMore: false, limit: 10 }
};

describe("getTxnPage", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.api.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses API dates and forwards serialized filters", async () => {
    mocks.GET.mockResolvedValue({ data: response });
    const { getTxnPage } = await import("./get-txn-page");
    const page = await getTxnPage({ limit: 10, from: new Date(timestamp), q: "chai" });

    expect(page.items[0]?.occurredAt).toEqual(new Date(timestamp));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/transactions", {
      params: { query: expect.objectContaining({ from: timestamp, q: "chai", limit: 10 }) }
    });
  });

  it("returns an empty page when the API body is invalid", async () => {
    mocks.GET.mockResolvedValue({ data: { items: "invalid" } });
    const { getTxnPage } = await import("./get-txn-page");

    await expect(getTxnPage({ limit: 25 })).resolves.toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false, limit: 25 }
    });
    expect(mocks.api).toHaveBeenCalled();
  });

  it("returns an empty page when the server client rejects", async () => {
    mocks.getServerApiClient.mockRejectedValue(new Error("unavailable"));
    const { getTxnPage } = await import("./get-txn-page");

    await expect(getTxnPage({ limit: 50 })).resolves.toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
    });
    expect(mocks.api).toHaveBeenCalled();
  });
});
