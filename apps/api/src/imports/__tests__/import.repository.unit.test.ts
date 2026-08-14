import { describe, expect, it } from "vitest";

import { asMockDbTx, createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { ImportBatchRepository } from "../import-batch.repository.js";
import { StagedRowRepository } from "../staged-row.repository.js";

describe("Import Repositories Unit Tests", () => {
  const sampleBatchRow = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    accountId: "123e4567-e89b-12d3-a456-426614174001",
    filename: "statements.csv",
    fileHash: "hash_abc",
    mapping: {
      date: "Date",
      amount: "Amount",
      description: "Desc",
      dateFormat: "YYYY-MM-DD" as const,
      amountConvention: "single_signed" as const
    },
    status: "pending" as const,
    statsTotal: 0,
    statsStaged: 0,
    statsDuplicates: 0,
    statsCommitted: 0,
    committedAt: null,
    revertedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const sampleStagedRow = {
    id: "123e4567-e89b-12d3-a456-426614174002",
    batchId: "123e4567-e89b-12d3-a456-426614174000",
    rowNumber: 1,
    raw: { Date: "2026-01-01", Amount: "100", Desc: "Coffee" },
    parsedOccurredAt: new Date("2026-01-01"),
    parsedAmountMinor: 10000,
    parsedType: "expense" as const,
    parsedDescription: "Coffee",
    dedupeHash: "dedupe_123",
    suggestedCategoryId: null,
    problems: [],
    isDuplicate: false,
    include: true,
    createdAt: new Date()
  };

  describe("ImportBatchRepository", () => {
    it("create inserts import batch", async () => {
      const mockDb = createMockDrizzleDb([sampleBatchRow]);
      const repo = new ImportBatchRepository(mockDb);

      const res = await repo.create(
        "u1",
        "123e4567-e89b-12d3-a456-426614174001",
        "statements.csv",
        "hash_abc",
        sampleBatchRow.mapping
      );
      expect(res.id).toBe(sampleBatchRow.id);
    });

    it("findById returns batch or null", async () => {
      const mockDb = createMockDrizzleDb([sampleBatchRow]);
      const repo = new ImportBatchRepository(mockDb);

      const res = await repo.findById("u1", sampleBatchRow.id);
      expect(res?.id).toBe(sampleBatchRow.id);
    });

    it("findByFileHash returns batch or null", async () => {
      const mockDb = createMockDrizzleDb([sampleBatchRow]);
      const repo = new ImportBatchRepository(mockDb);

      const res = await repo.findByFileHash("u1", "hash_abc");
      expect(res?.id).toBe(sampleBatchRow.id);
    });

    it("list returns user import batches", async () => {
      const mockDb = createMockDrizzleDb([sampleBatchRow]);
      const repo = new ImportBatchRepository(mockDb);

      const res = await repo.list("u1");
      expect(res).toHaveLength(1);
    });

    it("findLatestMappingForAccount returns latest mapping", async () => {
      const mockDb = createMockDrizzleDb([{ mapping: sampleBatchRow.mapping }]);
      const repo = new ImportBatchRepository(mockDb);

      const res = await repo.findLatestMappingForAccount(
        "u1",
        "123e4567-e89b-12d3-a456-426614174001"
      );
      expect(res?.date).toBe("Date");
    });

    it("markParsed updates batch status and stats", async () => {
      const mockDb = createMockDrizzleDb([]);
      const repo = new ImportBatchRepository(mockDb);

      await repo.markParsed("u1", sampleBatchRow.id, "staged", {
        total: 10,
        staged: 10,
        duplicates: 0,
        committed: 0
      });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("incrementCommittedCount updates committed stats in transaction", async () => {
      const mockDb = createMockDrizzleDb([]);
      const repo = new ImportBatchRepository(mockDb);

      // @ts-expect-error mock tx
      await repo.incrementCommittedCount("u1", sampleBatchRow.id, 5, mockDb);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("markCommitted updates batch status to committed", async () => {
      const mockDb = createMockDrizzleDb([]);
      const repo = new ImportBatchRepository(mockDb);

      await repo.markCommitted("u1", sampleBatchRow.id);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("markReverted updates batch status to reverted", async () => {
      const mockDb = createMockDrizzleDb([]);
      const repo = new ImportBatchRepository(mockDb);

      await repo.markReverted("u1", sampleBatchRow.id);
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("delete returns true when a row was deleted", async () => {
      const mockDb = createMockDrizzleDb([{ id: sampleBatchRow.id }]);
      const repo = new ImportBatchRepository(mockDb);

      const res = await repo.delete("u1", sampleBatchRow.id, asMockDbTx(mockDb));
      expect(res).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("delete returns false when no row matched (wrong status or already gone)", async () => {
      const mockDb = createMockDrizzleDb([]);
      const repo = new ImportBatchRepository(mockDb);

      const res = await repo.delete("u1", sampleBatchRow.id, asMockDbTx(mockDb));
      expect(res).toBe(false);
    });
  });

  describe("StagedRowRepository", () => {
    it("deleteAllForBatch deletes staged rows for batch", async () => {
      const mockDb = createMockDrizzleDb([]);
      const repo = new StagedRowRepository(mockDb);

      await repo.deleteAllForBatch("u1", sampleBatchRow.id);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("insertMany inserts staged rows", async () => {
      const mockDb = createMockDrizzleDb([{ id: sampleBatchRow.id }]);
      const repo = new StagedRowRepository(mockDb);

      await repo.insertMany("u1", sampleBatchRow.id, [
        {
          rowNumber: 1,
          raw: { Date: "2026-01-01" },
          parsed: {
            occurredAt: new Date("2026-01-01"),
            amountMinor: 1000,
            type: "expense",
            description: "Test"
          },
          problems: [],
          isDuplicate: false,
          include: true
        }
      ]);
      expect(mockDb.insert).toHaveBeenCalled();

      await repo.insertMany("u1", sampleBatchRow.id, []);
    });

    it("findByBatchId returns paginated staged rows", async () => {
      const mockDb = createMockDrizzleDb([sampleStagedRow]);
      const repo = new StagedRowRepository(mockDb);

      const res = await repo.findByBatchId("u1", sampleBatchRow.id, undefined, 10);
      expect(res.items).toHaveLength(1);
      expect(res.pageInfo.hasMore).toBe(false);
    });

    it("findById returns staged row or null", async () => {
      const mockDb = createMockDrizzleDb([sampleStagedRow]);
      const repo = new StagedRowRepository(mockDb);

      const res = await repo.findById("u1", sampleBatchRow.id, sampleStagedRow.id);
      expect(res?.id).toBe(sampleStagedRow.id);
    });

    it("findIncludableForBatch returns includable rows", async () => {
      const mockDb = createMockDrizzleDb([sampleStagedRow]);
      const repo = new StagedRowRepository(mockDb);

      const res = await repo.findIncludableForBatch("u1", sampleBatchRow.id);
      expect(res).toHaveLength(1);
    });

    it("updateRow updates staged row include status", async () => {
      const mockDb = createMockDrizzleDb([sampleStagedRow]);
      const repo = new StagedRowRepository(mockDb);

      const res = await repo.updateRow("u1", sampleBatchRow.id, sampleStagedRow.id, {
        include: true
      });
      expect(res?.include).toBe(true);
    });
  });
});
