import { describe, expect, it, vi } from "vitest";

import { ImportsService } from "../imports.service.js";

describe("ImportsService Unit Tests", () => {
  const sampleBatch = {
    id: "batch_1",
    userId: "u1",
    accountId: "acc_1",
    filename: "export.csv",
    fileHash: "hash_123",
    mapping: {
      date: "Date",
      amount: "Amount",
      description: "Description",
      dateFormat: "YYYY-MM-DD" as const,
      amountConvention: "single_signed" as const
    },
    status: "staged" as const,
    stats: { total: 1, staged: 1, duplicates: 0, committed: 0 },
    statsTotal: 1,
    statsStaged: 1,
    statsDuplicates: 0,
    statsCommitted: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const sampleStagedRow = {
    id: "row_1",
    batchId: "batch_1",
    rowNumber: 1,
    raw: { Date: "2026-01-01", Amount: "-50", Description: "Coffee" },
    parsed: {
      occurredAt: new Date("2026-01-01"),
      amountMinor: 5000,
      type: "expense" as const,
      description: "Coffee"
    },
    dedupeHash: "hash_1",
    suggestedCategoryId: "cat_1",
    problems: [],
    isDuplicate: false,
    include: true
  };

  const createService = (opts: {
    mockDb?: unknown;
    mockBatches?: unknown;
    mockStagedRows?: unknown;
    mockTransactions?: unknown;
    mockAccounts?: unknown;
    mockCategories?: unknown;
    mockRules?: unknown;
    mockAudit?: unknown;
    mockQueue?: unknown;
  }) => {
    const db = opts.mockDb ?? {
      transaction: vi.fn(async (cb: (tx: string) => Promise<unknown>) => cb("tx1"))
    };
    const batches = opts.mockBatches ?? {};
    const stagedRows = opts.mockStagedRows ?? {};
    const transactions = opts.mockTransactions ?? {};
    const accounts = opts.mockAccounts ?? {};
    const categories = opts.mockCategories ?? {};
    const rules = opts.mockRules ?? {};
    const audit = opts.mockAudit ?? {};
    const queue = opts.mockQueue ?? { enqueueParse: vi.fn(async () => undefined) };

    return new ImportsService(
      // @ts-expect-error mock service args
      db,
      batches,
      stagedRows,
      transactions,
      accounts,
      categories,
      audit,
      rules,
      queue
    );
  };

  it("list returns batches for user", async () => {
    const mockBatches = { list: vi.fn(async () => [sampleBatch]) };
    const service = createService({ mockBatches });

    const res = await service.list("u1");
    expect(res).toHaveLength(1);
  });

  it("getSavedMapping returns latest column mapping or null", async () => {
    const mockAccounts = { exists: vi.fn(async () => true) };
    const mockBatches = {
      findLatestMappingForAccount: vi.fn(async () => sampleBatch.mapping)
    };
    const service = createService({ mockAccounts, mockBatches });

    const res = await service.getSavedMapping("u1", "acc_1");
    expect(res?.date).toBe("Date");
  });

  it("preview returns paginated staged rows for batch", async () => {
    const mockBatches = { findById: vi.fn(async () => sampleBatch) };
    const mockStagedRows = {
      findByBatchId: vi.fn(async () => ({
        items: [sampleStagedRow],
        pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
      }))
    };
    const service = createService({ mockBatches, mockStagedRows });

    const res = await service.preview("u1", "batch_1", undefined, 50);
    expect(res.items).toHaveLength(1);
  });

  it("updateRow updates row include status", async () => {
    const mockBatches = { findById: vi.fn(async () => sampleBatch) };
    const mockCategories = {
      findActiveById: vi.fn(async () => ({ id: "cat_1", kind: "expense" }))
    };
    const mockStagedRows = {
      findById: vi.fn(async () => sampleStagedRow),
      updateRow: vi.fn(async () => sampleStagedRow)
    };
    const service = createService({ mockBatches, mockCategories, mockStagedRows });

    const res = await service.updateRow("u1", "batch_1", "row_1", { include: true });
    expect(res.id).toBe("row_1");
  });

  it("revertBatch reverts committed import batch and creates compensating reversals", async () => {
    const committedBatch = { ...sampleBatch, status: "committed" as const };
    const revertedBatch = { ...sampleBatch, status: "reverted" as const };
    let findByIdCalls = 0;
    const mockBatches = {
      findById: vi.fn(async () => (findByIdCalls++ === 0 ? committedBatch : revertedBatch)),
      markReverted: vi.fn(async () => undefined)
    };
    const mockAccounts = {
      findById: vi.fn(async () => ({ id: "acc_1", balanceMinor: 10000 })),
      applyReversalBalanceDelta: vi.fn(async () => true)
    };
    const mockTransactions = {
      findPostedByImportBatchId: vi.fn(async () => [
        {
          id: "tx_1",
          userId: "u1",
          accountId: "acc_1",
          type: "expense" as const,
          amountMinor: 5000,
          description: "Coffee"
        }
      ]),
      insertBulkReversals: vi.fn(async () => [
        {
          id: "rev_1",
          userId: "u1",
          accountId: "acc_1",
          type: "income" as const,
          amountMinor: 5000
        }
      ])
    };
    const mockAudit = { record: vi.fn(async () => undefined) };

    const service = createService({
      mockBatches,
      mockAccounts,
      mockTransactions,
      mockAudit
    });

    const res = await service.revertBatch("u1", "batch_1");
    expect(res.status).toBe("reverted");
  });
});
