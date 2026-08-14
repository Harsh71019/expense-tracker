import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { TransactionRepository } from "../transaction.repository.js";

describe("TransactionRepository Unit Tests", () => {
  const sampleTxRow = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    accountId: "123e4567-e89b-12d3-a456-426614174001",
    categoryId: "123e4567-e89b-12d3-a456-426614174002",
    type: "expense" as const,
    amountMinor: 5000,
    occurredAt: new Date("2026-01-01"),
    description: "Coffee",
    tags: ["food"],
    currency: "INR" as const,
    source: "manual" as const,
    status: "posted" as const,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("create inserts single transaction", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.create(
      "u1",
      {
        accountId: "123e4567-e89b-12d3-a456-426614174001",
        type: "expense",
        amountMinor: 5000,
        occurredAt: new Date("2026-01-01"),
        description: "Coffee",
        tags: ["food"]
      },
      undefined,
      // @ts-expect-error mock tx
      mockDb
    );
    expect(res.id).toBe(sampleTxRow.id);
  });

  it("findMany returns paginated transactions with filters", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.findMany("u1", {
      limit: 10,
      accountId: "123e4567-e89b-12d3-a456-426614174001",
      categoryId: "123e4567-e89b-12d3-a456-426614174002",
      q: "Coffee",
      from: new Date("2026-01-01"),
      to: new Date("2026-01-02")
    });

    expect(res.items).toHaveLength(1);
    expect(res.pageInfo.hasMore).toBe(false);
  });

  it("system discovery returns each unreconciled API row with its owning user", async () => {
    const apiRow = { ...sampleTxRow, source: "api" as const, userId: "owning-user" };
    const mockDb = createMockDrizzleDb([{ transaction: apiRow }]);
    const repo = new TransactionRepository(mockDb);

    const result = await repo.systemFindRecentUnreconciledApiTransactions(
      new Date("2025-12-25T00:00:00.000Z"),
      200
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe("owning-user");
    expect(mockDb.select).toHaveBeenCalled();
  });

  it("findExistingDedupeHashes returns matching dedupe hashes mapped to their transaction type", async () => {
    const mockDb = createMockDrizzleDb([{ dedupeHash: "hash123", type: "expense" }]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.findExistingDedupeHashes("u1", ["hash123", "hash456"]);
    expect(res.get("hash123")).toBe("expense");

    const emptyRes = await repo.findExistingDedupeHashes("u1", []);
    expect(emptyRes.size).toBe(0);
  });

  it("findExistingDedupeFingerprintsV2 returns matching v2 fingerprints", async () => {
    const mockDb = createMockDrizzleDb([{ dedupeFingerprintV2: "fp123" }]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.findExistingDedupeFingerprintsV2("u1", ["fp123", "fp456"]);
    expect(res.has("fp123")).toBe(true);

    const emptyRes = await repo.findExistingDedupeFingerprintsV2("u1", []);
    expect(emptyRes.size).toBe(0);
  });

  it("findNearDuplicateCandidateWindow returns candidates in the given window", async () => {
    const mockDb = createMockDrizzleDb([
      {
        transactionId: "123e4567-e89b-12d3-a456-426614174000",
        type: "expense",
        amountMinor: 2_000,
        description: "Chai",
        source: "manual",
        occurredAt: new Date("2026-01-01")
      }
    ]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.findNearDuplicateCandidateWindow(
      "u1",
      "acc1",
      new Date("2026-01-01"),
      new Date("2026-01-02"),
      20
    );
    expect(res).toHaveLength(1);
  });

  it("findByIdempotencyKey returns matching transaction or null", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.findByIdempotencyKey("u1", "key123");
    expect(res?.id).toBe(sampleTxRow.id);
  });

  it("findPostedById returns posted transaction or null", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.findPostedById("u1", sampleTxRow.id, mockDb);
    expect(res?.id).toBe(sampleTxRow.id);
  });

  it("findById returns transaction when present", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.findById("u1", sampleTxRow.id);
    expect(res?.id).toBe(sampleTxRow.id);
  });

  it("finds and categorizes a tenant-scoped transaction batch", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    await expect(
      repo.findByIds(
        "u1",
        [sampleTxRow.id],
        // @ts-expect-error mock tx
        mockDb
      )
    ).resolves.toHaveLength(1);
    await expect(
      repo.assignCategory(
        "u1",
        [sampleTxRow.id],
        sampleTxRow.categoryId,
        // @ts-expect-error mock tx
        mockDb
      )
    ).resolves.toBe(1);
  });

  it("skips empty transaction batches", async () => {
    const mockDb = createMockDrizzleDb();
    const repo = new TransactionRepository(mockDb);

    await expect(
      repo.findByIds(
        "u1",
        [],
        // @ts-expect-error mock tx
        mockDb
      )
    ).resolves.toEqual([]);
    await expect(
      repo.assignCategory(
        "u1",
        [],
        sampleTxRow.categoryId,
        // @ts-expect-error mock tx
        mockDb
      )
    ).resolves.toBe(0);
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("derives payment context while mapping a transaction row", async () => {
    const mockDb = createMockDrizzleDb([
      {
        ...sampleTxRow,
        description: "UPI/DR/BLINKIT/RRN:630934540626/blinkit.payu@hdfcbank"
      }
    ]);
    const repo = new TransactionRepository(mockDb);

    await expect(repo.findById("u1", sampleTxRow.id)).resolves.toMatchObject({
      paymentRail: "upi",
      counterpartyHandle: "blinkit.payu@hdfcbank"
    });
  });

  it("updateNonMonetaryFields updates description and tags", async () => {
    const updatedRow = { ...sampleTxRow, description: "Updated Coffee" };
    const mockDb = createMockDrizzleDb([updatedRow]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.updateNonMonetaryFields(
      "u1",
      sampleTxRow.id,
      { description: "Updated Coffee" },
      // @ts-expect-error mock tx
      mockDb
    );
    expect(res?.description).toBe("Updated Coffee");
  });

  it("findByReversalOf returns reversing transaction", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.findByReversalOf("u1", "orig_123");
    expect(res?.id).toBe(sampleTxRow.id);
  });

  it("createReversal inserts compensating reversal entry", async () => {
    const mockDb = createMockDrizzleDb([
      {
        ...sampleTxRow,
        type: "income" as const,
        status: "reversal" as const,
        reversalOf: sampleTxRow.id
      }
    ]);
    const repo = new TransactionRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.createReversal("u1", sampleTxRow, mockDb);
    expect(res.reversalOf).toBe(sampleTxRow.id);
  });

  it("insertImportedRows inserts multiple csv transactions", async () => {
    const mockDb = createMockDrizzleDb([]);
    const repo = new TransactionRepository(mockDb);

    await repo.insertImportedRows(
      "u1",
      "acc_123",
      "batch_123",
      [
        {
          occurredAt: new Date("2026-01-01"),
          type: "expense",
          amountMinor: 5000,
          description: "Test",
          dedupeFingerprintV2: "fingerprint123"
        }
      ],
      // @ts-expect-error mock tx
      mockDb
    );

    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("findPostedByImportBatchId returns transactions for import batch", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.findPostedByImportBatchId("u1", "batch_123");
    expect(res).toHaveLength(1);
  });

  it("insertBulkReversals inserts compensating reversal entries for import revert", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.insertBulkReversals("u1", [sampleTxRow], mockDb);
    expect(res).toHaveLength(1);

    // @ts-expect-error mock tx
    const empty = await repo.insertBulkReversals("u1", [], mockDb);
    expect(empty).toEqual([]);
  });

  it("findPostedLegsByTransferGroupId returns transfer leg transactions", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.findPostedLegsByTransferGroupId("u1", "tg_123", mockDb);
    expect(res).toHaveLength(1);
  });

  it("findLegsByTransferGroupId returns transfer leg transactions", async () => {
    const mockDb = createMockDrizzleDb([sampleTxRow]);
    const repo = new TransactionRepository(mockDb);

    const res = await repo.findLegsByTransferGroupId("u1", "tg_123");
    expect(res).toHaveLength(1);
  });

  it("markReversed updates transaction status to reversed", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleTxRow.id }]);
    const repo = new TransactionRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.markReversed("u1", sampleTxRow.id, "rev_123", mockDb);
    expect(res).toBe(true);
  });
});
