import { Inject, Injectable } from "@nestjs/common";
import {
  StagedRowSchema,
  type ImportBatchId,
  type StagedRow,
  type StagedRowId,
  type UpdateStagedRow
} from "@treasury-ops/shared";
import { and, asc, eq, exists, gt, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { importBatches, stagedRows } from "../common/db/schema/index.js";
import { InvalidCursorError } from "../common/errors/invalid-cursor.error.js";

export type NewStagedRow = Omit<StagedRow, "id" | "batchId">;

export type StagedRowPageResult = Readonly<{
  items: StagedRow[];
  pageInfo: Readonly<{ nextCursor: string | null; hasMore: boolean; limit: number }>;
}>;

const CursorPayloadSchema = z.object({ rowNumber: z.number().int().positive() });

@Injectable()
export class StagedRowRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /**
   * Clears any staged rows left behind by a previous, incomplete attempt at
   * parsing this batch. Called at the start of every parse job run so a
   * BullMQ retry re-derives staged_rows from scratch instead of appending to
   * (or double-counting) a partial prior run — parse is idempotent by
   * "clear then rewrite," not by per-row skip logic.
   */
  async deleteAllForBatch(userId: string, batchId: ImportBatchId): Promise<void> {
    await this.db
      .delete(stagedRows)
      .where(and(eq(stagedRows.batchId, batchId), this.ownedBatch(userId)));
  }

  async insertMany(
    userId: string,
    batchId: ImportBatchId,
    rows: readonly NewStagedRow[]
  ): Promise<void> {
    if (rows.length === 0) return;
    if (!(await this.batchBelongsTo(userId, batchId))) return;
    const now = new Date();
    await this.db.insert(stagedRows).values(
      rows.map((row) => ({
        batchId,
        rowNumber: row.rowNumber,
        raw: row.raw,
        parsedOccurredAt: row.parsed?.occurredAt ?? null,
        parsedAmountMinor: row.parsed?.amountMinor ?? null,
        parsedType: row.parsed?.type ?? null,
        parsedDescription: row.parsed?.description ?? null,
        dedupeHash: row.dedupeHash ?? null,
        suggestedCategoryId: row.suggestedCategoryId ?? null,
        problems: [...row.problems],
        isDuplicate: row.isDuplicate,
        include: row.include,
        createdAt: now
      }))
    );
  }

  async findByBatchId(
    userId: string,
    batchId: ImportBatchId,
    cursor: string | undefined,
    limit: number
  ): Promise<StagedRowPageResult> {
    const afterRowNumber = cursor === undefined ? null : decodeCursor(cursor);
    const conditions = [eq(stagedRows.batchId, batchId), this.ownedBatch(userId)];
    if (afterRowNumber !== null) conditions.push(gt(stagedRows.rowNumber, afterRowNumber));

    const rows = await this.db
      .select()
      .from(stagedRows)
      .where(and(...conditions))
      .orderBy(asc(stagedRows.rowNumber))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const items = page.map(toStagedRow);
    const last = items.at(-1);
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && last !== undefined ? encodeCursor(last.rowNumber) : null;

    return { items, pageInfo: { nextCursor, hasMore, limit } };
  }

  async findById(
    userId: string,
    batchId: ImportBatchId,
    rowId: StagedRowId
  ): Promise<StagedRow | null> {
    const [row] = await this.db
      .select()
      .from(stagedRows)
      .where(
        and(eq(stagedRows.id, rowId), eq(stagedRows.batchId, batchId), this.ownedBatch(userId))
      );
    return row === undefined ? null : toStagedRow(row);
  }

  /**
   * All includable rows for a commit run, unpaginated — bounded by
   * MAX_IMPORT_ROWS (50k), a manageable in-memory array. Only rows with
   * `include: true` (which implies `parsed` is set — parseFile only ever
   * marks a row includable when it parsed cleanly and wasn't a duplicate).
   */
  async findIncludableForBatch(userId: string, batchId: ImportBatchId): Promise<StagedRow[]> {
    const rows = await this.db
      .select()
      .from(stagedRows)
      .where(
        and(eq(stagedRows.batchId, batchId), eq(stagedRows.include, true), this.ownedBatch(userId))
      )
      .orderBy(asc(stagedRows.rowNumber));
    return rows.map(toStagedRow);
  }

  /**
   * Toggling `include`/`suggestedCategoryId` — the preview screen's edits.
   * A row with no parsed data (it failed to parse) can never be flipped to
   * `include: true` — there's nothing committable on it, and commitBatch's
   * findIncludableForBatch assumes every includable row has parsed data.
   * Enforced in the filter itself rather than the caller.
   */
  async updateRow(
    userId: string,
    batchId: ImportBatchId,
    rowId: StagedRowId,
    patch: UpdateStagedRow
  ): Promise<StagedRow | null> {
    const set: Record<string, unknown> = {};
    if (patch.include !== undefined) set.include = patch.include;
    if (patch.suggestedCategoryId !== undefined) {
      set.suggestedCategoryId = patch.suggestedCategoryId;
    }

    const conditions = [
      eq(stagedRows.id, rowId),
      eq(stagedRows.batchId, batchId),
      this.ownedBatch(userId)
    ];
    if (patch.include === true) conditions.push(isNotNull(stagedRows.parsedOccurredAt));

    const [row] = await this.db
      .update(stagedRows)
      .set(set)
      .where(and(...conditions))
      .returning();
    return row === undefined ? null : toStagedRow(row);
  }

  private ownedBatch(userId: string): ReturnType<typeof exists> {
    return exists(
      this.db
        .select({ id: importBatches.id })
        .from(importBatches)
        .where(and(eq(importBatches.id, stagedRows.batchId), eq(importBatches.userId, userId)))
    );
  }

  private async batchBelongsTo(userId: string, batchId: ImportBatchId): Promise<boolean> {
    const [row] = await this.db
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(and(eq(importBatches.userId, userId), eq(importBatches.id, batchId)))
      .limit(1);
    return row !== undefined;
  }
}

function toStagedRow(row: typeof stagedRows.$inferSelect): StagedRow {
  const parsed =
    row.parsedOccurredAt === null ||
    row.parsedAmountMinor === null ||
    row.parsedType === null ||
    row.parsedDescription === null
      ? undefined
      : {
          occurredAt: row.parsedOccurredAt,
          amountMinor: row.parsedAmountMinor,
          type: row.parsedType,
          description: row.parsedDescription
        };
  return StagedRowSchema.parse({
    id: row.id,
    batchId: row.batchId,
    rowNumber: row.rowNumber,
    raw: row.raw,
    parsed,
    dedupeHash: row.dedupeHash ?? undefined,
    suggestedCategoryId: row.suggestedCategoryId ?? undefined,
    problems: row.problems,
    isDuplicate: row.isDuplicate,
    include: row.include
  });
}

function encodeCursor(rowNumber: number): string {
  return Buffer.from(JSON.stringify({ rowNumber }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): number {
  try {
    const payload = CursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    );
    return payload.rowNumber;
  } catch {
    throw new InvalidCursorError();
  }
}
