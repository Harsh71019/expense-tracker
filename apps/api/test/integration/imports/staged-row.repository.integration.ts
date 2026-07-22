import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ColumnMapping } from "@treasury-ops/shared";

import { AccountRepository } from "../../../src/accounts/account.repository.js";
import { CategoryRepository } from "../../../src/categories/category.repository.js";
import { withTxn } from "../../../src/common/db/db-txn.js";
import { stagedRows as stagedRowsTable } from "../../../src/common/db/schema/index.js";
import { ImportBatchRepository } from "../../../src/imports/import-batch.repository.js";
import type { NewStagedRow } from "../../../src/imports/staged-row.repository.js";
import { StagedRowRepository } from "../../../src/imports/staged-row.repository.js";
import { createTestDb, insertTestUser } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

const MAPPING: ColumnMapping = {
  date: "Txn Date",
  description: "Narration",
  amount: "Amount",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed"
};

function row(overrides: Partial<NewStagedRow> = {}): NewStagedRow {
  return {
    rowNumber: 1,
    raw: { "Txn Date": "04/07/2026", Narration: "Chai", Amount: "-20.00" },
    problems: [],
    isDuplicate: false,
    include: true,
    ...overrides
  };
}

describe("StagedRowRepository", () => {
  let testDb: TestDb;
  let rows: StagedRowRepository;
  let batches: ImportBatchRepository;
  let accountId: string;
  let categoryId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertTestUser(testDb.db, "user-a");
    rows = new StagedRowRepository(testDb.db);
    batches = new ImportBatchRepository(testDb.db);
    const accounts = new AccountRepository(testDb.db);
    const categories = new CategoryRepository(testDb.db);
    accountId = (
      await withTxn(testDb.db, (tx) =>
        accounts.create(
          "user-a",
          { name: "Test Account", type: "bank", openingBalanceMinor: 0 },
          tx
        )
      )
    ).id;
    categoryId = (await categories.create("user-a", { name: "Food", kind: "expense" })).id;
  }, 60_000);

  afterAll(async () => {
    await testDb.teardown();
  });

  async function newBatchId(fileHash: string): Promise<string> {
    const batch = await batches.create("user-a", accountId, "statement.csv", fileHash, MAPPING);
    return batch.id;
  }

  it("inserts nothing for an empty batch instead of erroring on an empty insertMany", async () => {
    const batchId = await newBatchId("sha256:empty");
    await expect(rows.insertMany(batchId, [])).resolves.toBeUndefined();
  });

  it("bulk-inserts staged rows scoped to their batch", async () => {
    const batchId = await newBatchId("sha256:bulk");
    const otherBatchId = await newBatchId("sha256:bulk-other");

    await rows.insertMany(batchId, [
      row({ rowNumber: 1 }),
      row({
        rowNumber: 2,
        parsed: {
          occurredAt: new Date("2026-07-04T00:00:00Z"),
          amountMinor: 2_000,
          type: "expense",
          description: "Chai"
        },
        dedupeHash: "hash-2"
      })
    ]);
    await rows.insertMany(otherBatchId, [row({ rowNumber: 1 })]);

    const stored = await testDb.db
      .select()
      .from(stagedRowsTable)
      .where(eq(stagedRowsTable.batchId, batchId))
      .orderBy(stagedRowsTable.rowNumber);

    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({ rowNumber: 1, include: true, isDuplicate: false });
    expect(stored[1]).toMatchObject({ rowNumber: 2, dedupeHash: "hash-2" });
    expect(stored[1]).toMatchObject({ parsedAmountMinor: 2_000, parsedType: "expense" });
  });

  it("clears only the target batch's rows, leaving other batches untouched", async () => {
    const batchId = await newBatchId("sha256:clear");
    const otherBatchId = await newBatchId("sha256:clear-other");
    await rows.insertMany(batchId, [row({ rowNumber: 1 })]);
    await rows.insertMany(otherBatchId, [row({ rowNumber: 1 })]);

    await rows.deleteAllForBatch(batchId);

    expect(
      (await testDb.db.select().from(stagedRowsTable).where(eq(stagedRowsTable.batchId, batchId)))
        .length
    ).toBe(0);
    expect(
      (
        await testDb.db
          .select()
          .from(stagedRowsTable)
          .where(eq(stagedRowsTable.batchId, otherBatchId))
      ).length
    ).toBe(1);
  });

  it("paginates by rowNumber and the cursor never crosses into another batch", async () => {
    const batchId = await newBatchId("sha256:paginate");
    const otherBatchId = await newBatchId("sha256:paginate-other");
    await rows.insertMany(
      batchId,
      Array.from({ length: 5 }, (_unused, index) => row({ rowNumber: index + 1 }))
    );
    await rows.insertMany(otherBatchId, [row({ rowNumber: 1 })]);

    const firstPage = await rows.findByBatchId(batchId, undefined, 2);
    expect(firstPage.items.map((item) => item.rowNumber)).toEqual([1, 2]);
    expect(firstPage.pageInfo.hasMore).toBe(true);
    expect(firstPage.pageInfo.nextCursor).not.toBeNull();

    const secondPage = await rows.findByBatchId(
      batchId,
      firstPage.pageInfo.nextCursor ?? undefined,
      2
    );
    expect(secondPage.items.map((item) => item.rowNumber)).toEqual([3, 4]);

    const thirdPage = await rows.findByBatchId(
      batchId,
      secondPage.pageInfo.nextCursor ?? undefined,
      2
    );
    expect(thirdPage.items.map((item) => item.rowNumber)).toEqual([5]);
    expect(thirdPage.pageInfo.hasMore).toBe(false);
    expect(thirdPage.pageInfo.nextCursor).toBeNull();
  });

  it("updateRow toggles include and sets/clears suggestedCategoryId, scoped to its batch", async () => {
    const batchId = await newBatchId("sha256:update");
    const otherBatchId = await newBatchId("sha256:update-other");
    await rows.insertMany(batchId, [row({ rowNumber: 1 })]);
    const [inserted] = (await rows.findByBatchId(batchId, undefined, 10)).items;
    const rowId = nonNull(inserted).id;

    expect(await rows.updateRow(batchId, rowId, { include: false })).toMatchObject({
      include: false
    });

    const withCategory = await rows.updateRow(batchId, rowId, {
      suggestedCategoryId: categoryId
    });
    expect(withCategory).toMatchObject({ suggestedCategoryId: categoryId });

    const cleared = await rows.updateRow(batchId, rowId, { suggestedCategoryId: null });
    expect(cleared?.suggestedCategoryId).toBeUndefined();

    expect(await rows.updateRow(otherBatchId, rowId, { include: false })).toBeNull();
  });

  it("updateRow refuses to set include: true on a row with no parsed data", async () => {
    const batchId = await newBatchId("sha256:no-parsed");
    await rows.insertMany(batchId, [
      row({
        rowNumber: 1,
        parsed: undefined,
        dedupeHash: undefined,
        problems: ['Row is missing a value for column "Amount".'],
        isDuplicate: false,
        include: false
      })
    ]);
    const [inserted] = (await rows.findByBatchId(batchId, undefined, 10)).items;
    const rowId = nonNull(inserted).id;

    expect(await rows.updateRow(batchId, rowId, { include: true })).toBeNull();

    // Editing its category is still fine — only flipping it includable is blocked.
    expect(await rows.updateRow(batchId, rowId, { suggestedCategoryId: categoryId })).toMatchObject(
      { suggestedCategoryId: categoryId, include: false }
    );
  });
});

function nonNull<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Expected a staged row to exist");
  }
  return value;
}
