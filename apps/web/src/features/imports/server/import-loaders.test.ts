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

describe("import server loaders", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.api.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("loads import batches", async () => {
    mocks.GET.mockResolvedValue({ data: [batch] });
    const { getImportBatches } = await import("./get-import-batches");
    await expect(getImportBatches()).resolves.toMatchObject([{ filename: "hdfc.csv" }]);
  });

  it("fails closed on a malformed API response", async () => {
    mocks.GET.mockResolvedValue({ data: [{ id: "invalid" }] });
    const { getImportBatches } = await import("./get-import-batches");
    await expect(getImportBatches()).resolves.toEqual([]);
  });

  it("fails closed when the API request throws", async () => {
    mocks.GET.mockRejectedValue(new Error("offline"));
    const { getImportBatches } = await import("./get-import-batches");
    await expect(getImportBatches()).resolves.toEqual([]);
  });
});
