import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));
vi.mock("@/lib/debug", () => ({ debug: { api: mocks.api } }));

const timestamp = "2026-07-16T00:00:00.000Z";
const batch = {
  id: "507f1f77bcf86cd799439013",
  userId: "user-1",
  accountId: "507f1f77bcf86cd799439011",
  filename: "hdfc.csv",
  fileHash: "hash",
  mapping: {
    date: "Date",
    description: "Narration",
    dateFormat: "DD/MM/YYYY",
    amountConvention: "single_signed",
    amount: "Amount"
  },
  status: "staged",
  stats: { total: 1, staged: 1, duplicates: 0, committed: 0 },
  createdAt: timestamp,
  updatedAt: timestamp
};
const page = { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } };

describe("import server loaders", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.api.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("loads batches, locates one batch, and loads its first staged page", async () => {
    mocks.GET.mockImplementation((path: string) =>
      Promise.resolve({ data: path === "/v1/imports" ? [batch] : page })
    );
    const { getImportBatch, getImportBatches } = await import("./get-import-batches");
    const { getStagedRows } = await import("./get-staged-rows");
    await expect(getImportBatches()).resolves.toMatchObject([{ filename: "hdfc.csv" }]);
    await expect(getImportBatch(batch.id)).resolves.toMatchObject({ id: batch.id });
    await expect(getStagedRows(batch.id)).resolves.toEqual(page);
  });

  it("fails closed for malformed and unavailable API responses", async () => {
    mocks.GET.mockResolvedValue({ data: [{ id: "invalid" }] });
    const { getImportBatches } = await import("./get-import-batches");
    await expect(getImportBatches()).resolves.toEqual([]);
    mocks.GET.mockRejectedValue(new Error("offline"));
    const { getStagedRows } = await import("./get-staged-rows");
    await expect(getStagedRows(batch.id)).resolves.toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
    });
  });
});
