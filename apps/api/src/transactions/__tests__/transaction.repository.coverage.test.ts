import type { Transaction } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { InvalidCursorError } from "../../common/errors/invalid-cursor.error.js";
import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { TransactionRepository } from "../transaction.repository.js";

const TRANSACTION_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACCOUNT_ID = "223e4567-e89b-42d3-a456-426614174000";
const CATEGORY_ID = "323e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const ROW = {
  id: TRANSACTION_ID,
  userId: "u1",
  accountId: ACCOUNT_ID,
  categoryId: CATEGORY_ID,
  type: "expense" as const,
  status: "posted" as const,
  amountMinor: 5_000,
  currency: "INR" as const,
  source: "manual" as const,
  occurredAt: NOW,
  description: "50% coffee_beans\\shop",
  tags: ["food"],
  idempotencyKey: null,
  reversalOf: null,
  reversedBy: null,
  transferGroupId: null,
  importBatchId: null,
  dedupeHash: null,
  createdAt: NOW,
  updatedAt: NOW
};
const TRANSACTION: Transaction = {
  id: TRANSACTION_ID,
  userId: "u1",
  accountId: ACCOUNT_ID,
  categoryId: CATEGORY_ID,
  type: "expense",
  status: "posted",
  amountMinor: 5_000,
  currency: "INR",
  source: "manual",
  paymentRail: "unknown",
  counterpartyHandle: null,
  occurredAt: NOW,
  description: ROW.description,
  tags: ["food"],
  createdAt: NOW,
  updatedAt: NOW
};

describe("TransactionRepository edge coverage", () => {
  it("rejects create and reversal inserts that return no row", async () => {
    const db = createMockDrizzleDb();
    const repository = new TransactionRepository(db);
    const input = {
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      type: "expense" as const,
      amountMinor: 5_000,
      occurredAt: NOW,
      description: "Coffee",
      tags: []
    };

    await expect(
      repository.create(
        "u1",
        input,
        "key",
        // @ts-expect-error - fluent transaction double.
        db,
        "423e4567-e89b-42d3-a456-426614174000",
        "api"
      )
    ).rejects.toThrow("Transaction insert did not return a row.");
    await expect(
      repository.createReversal(
        "u1",
        TRANSACTION,
        // @ts-expect-error - fluent transaction double.
        db,
        "423e4567-e89b-42d3-a456-426614174000"
      )
    ).rejects.toThrow("Reversal insert did not return a row.");
  });

  it("paginates with every optional filter, a valid cursor, tag, and escaped search", async () => {
    const db = createMockDrizzleDb([ROW, { ...ROW, id: "423e4567-e89b-42d3-a456-426614174000" }]);
    const repository = new TransactionRepository(db);
    const cursor = Buffer.from(
      JSON.stringify({ occurredAt: NOW.toISOString(), id: TRANSACTION_ID }),
      "utf8"
    ).toString("base64url");

    const result = await repository.findMany("u1", {
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      from: NOW,
      to: NOW,
      q: ROW.description,
      tag: "food",
      cursor,
      limit: 1
    });

    expect(result.items).toHaveLength(1);
    expect(result.pageInfo).toMatchObject({ hasMore: true, limit: 1 });
    expect(result.pageInfo.nextCursor).toEqual(expect.any(String));
  });

  it("rejects invalid cursors and returns a cursorless empty page", async () => {
    const repository = new TransactionRepository(createMockDrizzleDb());
    await expect(repository.findMany("u1", { cursor: "invalid", limit: 1 })).rejects.toBeInstanceOf(
      InvalidCursorError
    );
    await expect(repository.findMany("u1", { limit: 1 })).resolves.toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false, limit: 1 }
    });
  });

  it("filters null dedupe hashes", async () => {
    const repository = new TransactionRepository(
      createMockDrizzleDb([
        { dedupeHash: null, type: "expense" },
        { dedupeHash: "hash", type: "expense" }
      ])
    );
    await expect(repository.findExistingDedupeHashes("u1", ["hash"])).resolves.toEqual(
      new Map([["hash", "expense"]])
    );
  });

  it("filters null dedupe fingerprints v2", async () => {
    const repository = new TransactionRepository(
      createMockDrizzleDb([{ dedupeFingerprintV2: null }, { dedupeFingerprintV2: "fp" }])
    );
    await expect(repository.findExistingDedupeFingerprintsV2("u1", ["fp"])).resolves.toEqual(
      new Set(["fp"])
    );
  });

  it("returns null from every optional single-row lookup", async () => {
    const db = createMockDrizzleDb();
    const repository = new TransactionRepository(db);

    await expect(repository.findByIdempotencyKey("u1", "key")).resolves.toBeNull();
    await expect(
      repository.findPostedById(
        "u1",
        TRANSACTION_ID,
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).resolves.toBeNull();
    await expect(repository.findById("u1", TRANSACTION_ID)).resolves.toBeNull();
    await expect(
      repository.findById(
        "u1",
        TRANSACTION_ID,
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).resolves.toBeNull();
    await expect(repository.findByReversalOf("u1", TRANSACTION_ID)).resolves.toBeNull();
  });

  it("sets every mutable metadata field and handles a lost update", async () => {
    const foundDb = createMockDrizzleDb([{ ...ROW, description: "Updated", tags: [] }]);
    const missingDb = createMockDrizzleDb();

    await expect(
      new TransactionRepository(foundDb).updateNonMonetaryFields(
        "u1",
        TRANSACTION_ID,
        { description: "Updated", tags: [], categoryId: null },
        // @ts-expect-error - fluent transaction double.
        foundDb
      )
    ).resolves.toMatchObject({ description: "Updated", tags: [] });
    await expect(
      new TransactionRepository(missingDb).updateNonMonetaryFields(
        "u1",
        TRANSACTION_ID,
        { tags: ["new"] },
        // @ts-expect-error - fluent transaction double.
        missingDb
      )
    ).resolves.toBeNull();
  });

  it("creates the opposite reversal type for income", async () => {
    const income = { ...TRANSACTION, type: "income" as const, categoryId: undefined };
    const expenseReversal = {
      ...ROW,
      type: "expense" as const,
      status: "reversal" as const,
      categoryId: null,
      reversalOf: TRANSACTION_ID
    };
    const db = createMockDrizzleDb([expenseReversal]);

    await expect(
      new TransactionRepository(db).createReversal(
        "u1",
        income,
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).resolves.toMatchObject({ type: "expense", reversalOf: TRANSACTION_ID });
  });

  it("skips empty imported rows and maps optional categories", async () => {
    const db = createMockDrizzleDb();
    const repository = new TransactionRepository(db);

    // @ts-expect-error - fluent transaction double.
    await repository.insertImportedRows("u1", ACCOUNT_ID, "batch", [], db);
    await repository.insertImportedRows(
      "u1",
      ACCOUNT_ID,
      "batch",
      [
        {
          occurredAt: NOW,
          type: "income",
          amountMinor: 1,
          description: "Refund",
          dedupeFingerprintV2: "fingerprint",
          categoryId: CATEGORY_ID
        }
      ],
      // @ts-expect-error - fluent transaction double.
      db
    );
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("bulk-reverses both transaction types and rejects incomplete insert results", async () => {
    const income = {
      ...TRANSACTION,
      id: "423e4567-e89b-42d3-a456-426614174000",
      type: "income" as const
    };
    const reversalRows = [
      { ...ROW, id: "523e4567-e89b-42d3-a456-426614174000", type: "income", status: "reversal" },
      { ...ROW, id: "623e4567-e89b-42d3-a456-426614174000", type: "expense", status: "reversal" }
    ];
    const db = createMockDrizzleDb(reversalRows);
    await expect(
      new TransactionRepository(db).insertBulkReversals(
        "u1",
        [TRANSACTION, income],
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).resolves.toHaveLength(2);

    const incomplete = createMockDrizzleDb([reversalRows[0]]);
    await expect(
      new TransactionRepository(incomplete).insertBulkReversals(
        "u1",
        [TRANSACTION, income],
        // @ts-expect-error - fluent transaction double.
        incomplete
      )
    ).rejects.toThrow("did not return a row for every original");
  });

  it("returns false when markReversed updates no row", async () => {
    const db = createMockDrizzleDb();
    await expect(
      new TransactionRepository(db).markReversed(
        "u1",
        TRANSACTION_ID,
        "423e4567-e89b-42d3-a456-426614174000",
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).resolves.toBe(false);
  });
});
