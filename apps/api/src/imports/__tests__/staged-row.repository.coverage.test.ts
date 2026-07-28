import { describe, expect, it } from "vitest";

import { InvalidCursorError } from "../../common/errors/invalid-cursor.error.js";
import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { StagedRowRepository } from "../staged-row.repository.js";

const BATCH_ID = "123e4567-e89b-42d3-a456-426614174000";
const ROW_ID = "223e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const ROW = {
  id: ROW_ID,
  batchId: BATCH_ID,
  rowNumber: 1,
  raw: { Date: "2026-07-01" },
  parsedOccurredAt: NOW,
  parsedAmountMinor: 1_000,
  parsedType: "expense" as const,
  parsedDescription: "Coffee",
  dedupeHash: "hash",
  suggestedCategoryId: null,
  problems: [],
  isDuplicate: false,
  include: true,
  createdAt: NOW
};

describe("StagedRowRepository edge coverage", () => {
  it("maps optional fields while inserting parsed and unparsed rows", async () => {
    const db = createMockDrizzleDb([{ id: BATCH_ID }]);
    await new StagedRowRepository(db).insertMany("u1", BATCH_ID, [
      {
        rowNumber: 1,
        raw: {},
        problems: ["invalid"],
        isDuplicate: false,
        include: false
      },
      {
        rowNumber: 2,
        raw: {},
        parsed: {
          occurredAt: NOW,
          amountMinor: 1_000,
          type: "expense",
          description: "Coffee"
        },
        dedupeHash: "hash",
        suggestedCategoryId: "323e4567-e89b-42d3-a456-426614174000",
        problems: [],
        isDuplicate: false,
        include: true
      }
    ]);
    expect(db.values).toHaveBeenCalled();
  });

  it("paginates after a valid cursor and rejects an invalid cursor", async () => {
    const db = createMockDrizzleDb([ROW, { ...ROW, id: "323e4567-e89b-42d3-a456-426614174000" }]);
    const repository = new StagedRowRepository(db);
    const cursor = Buffer.from(JSON.stringify({ rowNumber: 1 }), "utf8").toString("base64url");

    await expect(repository.findByBatchId("u1", BATCH_ID, cursor, 1)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: ROW_ID })],
      pageInfo: { hasMore: true, limit: 1, nextCursor: expect.any(String) }
    });
    await expect(repository.findByBatchId("u1", BATCH_ID, "invalid", 1)).rejects.toBeInstanceOf(
      InvalidCursorError
    );
  });

  it("returns null for missing rows and lost updates", async () => {
    const repository = new StagedRowRepository(createMockDrizzleDb());
    await expect(repository.findById("u1", BATCH_ID, ROW_ID)).resolves.toBeNull();
    await expect(
      repository.updateRow("u1", BATCH_ID, ROW_ID, { suggestedCategoryId: null })
    ).resolves.toBeNull();
  });

  it("updates include and suggested category independently", async () => {
    const db = createMockDrizzleDb([ROW]);
    const repository = new StagedRowRepository(db);

    await expect(
      repository.updateRow("u1", BATCH_ID, ROW_ID, { include: false })
    ).resolves.toMatchObject({
      include: true
    });
    await expect(
      repository.updateRow("u1", BATCH_ID, ROW_ID, {
        suggestedCategoryId: "323e4567-e89b-42d3-a456-426614174000"
      })
    ).resolves.toMatchObject({ id: ROW_ID });
  });

  it("maps any incomplete parsed tuple as an unparsed staged row", async () => {
    const incompleteRows = [
      { ...ROW, parsedOccurredAt: null },
      { ...ROW, parsedAmountMinor: null },
      { ...ROW, parsedType: null },
      { ...ROW, parsedDescription: null }
    ];

    for (const row of incompleteRows) {
      const repository = new StagedRowRepository(createMockDrizzleDb([row]));
      await expect(repository.findById("u1", BATCH_ID, ROW_ID)).resolves.toMatchObject({
        parsed: undefined
      });
    }
  });
});
