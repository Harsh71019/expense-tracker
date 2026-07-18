import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  StagedRowSchema,
  type ImportBatchId,
  type StagedRow,
  type StagedRowId,
  type UpdateStagedRow
} from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";
import { z } from "zod";

import { InvalidCursorError } from "../common/errors/invalid-cursor.error.js";

const STAGED_ROWS_COLLECTION = "staged_rows";

export type NewStagedRow = Omit<StagedRow, "id" | "batchId">;

export type StagedRowPageResult = Readonly<{
  items: StagedRow[];
  pageInfo: Readonly<{ nextCursor: string | null; hasMore: boolean; limit: number }>;
}>;

const CursorPayloadSchema = z.object({ rowNumber: z.number().int().positive() });

@Injectable()
export class StagedRowRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Clears any staged rows left behind by a previous, incomplete attempt at
   * parsing this batch. Called at the start of every parse job run so a
   * BullMQ retry re-derives staged_rows from scratch instead of appending to
   * (or double-counting) a partial prior run — parse is idempotent by
   * "clear then rewrite," not by per-row skip logic.
   */
  async deleteAllForBatch(batchId: ImportBatchId): Promise<void> {
    await this.database()
      .collection(STAGED_ROWS_COLLECTION)
      .deleteMany({ batchId: new Types.ObjectId(batchId) });
  }

  async insertMany(batchId: ImportBatchId, rows: readonly NewStagedRow[]): Promise<void> {
    if (rows.length === 0) return;

    const now = new Date();
    const documents = rows.map((row) => ({
      batchId: new Types.ObjectId(batchId),
      rowNumber: row.rowNumber,
      raw: row.raw,
      ...(row.parsed === undefined ? {} : { parsed: row.parsed }),
      ...(row.dedupeHash === undefined ? {} : { dedupeHash: row.dedupeHash }),
      ...(row.suggestedCategoryId === undefined
        ? {}
        : { suggestedCategoryId: row.suggestedCategoryId }),
      problems: row.problems,
      isDuplicate: row.isDuplicate,
      include: row.include,
      createdAt: now
    }));

    await this.database().collection(STAGED_ROWS_COLLECTION).insertMany(documents);
  }

  async findByBatchId(
    batchId: ImportBatchId,
    cursor: string | undefined,
    limit: number
  ): Promise<StagedRowPageResult> {
    const afterRowNumber = cursor === undefined ? null : decodeCursor(cursor);
    const filter: Record<string, unknown> = {
      batchId: new Types.ObjectId(batchId),
      ...(afterRowNumber === null ? {} : { rowNumber: { $gt: afterRowNumber } })
    };

    const documents = await this.database()
      .collection(STAGED_ROWS_COLLECTION)
      .find(filter)
      .sort({ rowNumber: 1 })
      .limit(limit + 1)
      .toArray();

    const page = documents.slice(0, limit);
    const items = page.map((document) => this.toStagedRow(document));
    const last = items.at(-1);
    const hasMore = documents.length > limit;
    const nextCursor = hasMore && last !== undefined ? encodeCursor(last.rowNumber) : null;

    return { items, pageInfo: { nextCursor, hasMore, limit } };
  }

  /**
   * All includable rows for a commit run, unpaginated — bounded by
   * MAX_IMPORT_ROWS (50k), a manageable in-memory array. Only rows with
   * `include: true` (which implies `parsed` is set — parseFile only ever
   * marks a row includable when it parsed cleanly and wasn't a duplicate).
   */
  async findIncludableForBatch(batchId: ImportBatchId): Promise<StagedRow[]> {
    const documents = await this.database()
      .collection(STAGED_ROWS_COLLECTION)
      .find({ batchId: new Types.ObjectId(batchId), include: true })
      .sort({ rowNumber: 1 })
      .toArray();
    return documents.map((document) => this.toStagedRow(document));
  }

  /**
   * Toggling `include`/`suggestedCategoryId` — the preview screen's edits.
   * A row with no `parsed` data (it failed to parse) can never be flipped to
   * `include: true` — there's nothing committable on it, and commitBatch's
   * findIncludableForBatch assumes every includable row has parsed data.
   * Enforced in the filter itself rather than the caller: a row that
   * doesn't satisfy that invariant simply doesn't match, so this returns
   * null exactly like "row not found" does — safe by construction, not by
   * trusting every call site to remember to check.
   */
  async updateRow(
    batchId: ImportBatchId,
    rowId: StagedRowId,
    patch: UpdateStagedRow
  ): Promise<StagedRow | null> {
    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    if (patch.include !== undefined) set.include = patch.include;
    if (patch.suggestedCategoryId !== undefined) {
      if (patch.suggestedCategoryId === null) {
        unset.suggestedCategoryId = "";
      } else {
        set.suggestedCategoryId = patch.suggestedCategoryId;
      }
    }

    const requiresParsed = patch.include === true ? { parsed: { $exists: true } } : {};
    const result = await this.database()
      .collection(STAGED_ROWS_COLLECTION)
      .findOneAndUpdate(
        { _id: new Types.ObjectId(rowId), batchId: new Types.ObjectId(batchId), ...requiresParsed },
        { $set: set, ...(Object.keys(unset).length === 0 ? {} : { $unset: unset }) },
        { returnDocument: "after" }
      );
    return result === null ? null : this.toStagedRow(result);
  }

  private toStagedRow(value: Record<string, unknown>): StagedRow {
    const { _id, batchId, suggestedCategoryId, ...rest } = value;
    return StagedRowSchema.parse({
      id: objectIdString(_id),
      batchId: objectIdString(batchId),
      ...(suggestedCategoryId === undefined ? {} : { suggestedCategoryId }),
      ...rest
    });
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) {
      throw new Error("MongoDB connection is not ready");
    }
    return database;
  }
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

function objectIdString(value: unknown): string {
  if (typeof value !== "object" || value === null || !("toString" in value)) {
    throw new Error("MongoDB document contains an invalid ObjectId.");
  }
  const stringify = value.toString;
  if (typeof stringify !== "function") {
    throw new Error("MongoDB document contains an invalid ObjectId.");
  }
  return stringify.call(value);
}
