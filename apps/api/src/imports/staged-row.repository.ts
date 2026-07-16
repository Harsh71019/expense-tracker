import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { ImportBatchId, StagedRow } from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";

const STAGED_ROWS_COLLECTION = "staged_rows";

export type NewStagedRow = Omit<StagedRow, "id" | "batchId">;

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
        : { suggestedCategoryId: new Types.ObjectId(row.suggestedCategoryId) }),
      problems: row.problems,
      isDuplicate: row.isDuplicate,
      include: row.include,
      createdAt: now
    }));

    await this.database().collection(STAGED_ROWS_COLLECTION).insertMany(documents);
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) {
      throw new Error("MongoDB connection is not ready");
    }
    return database;
  }
}
