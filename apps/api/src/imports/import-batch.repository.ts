import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  ImportBatchSchema,
  type AccountId,
  type ColumnMapping,
  type ImportBatch,
  type ImportBatchId,
  type ImportBatchStats,
  type ImportBatchStatus
} from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";

import type { MongoSession } from "../common/mongo-txn.js";

const IMPORT_BATCHES_COLLECTION = "import_batches";

const EMPTY_STATS: ImportBatchStats = { total: 0, staged: 0, duplicates: 0, committed: 0 };

@Injectable()
export class ImportBatchRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async create(
    userId: string,
    accountId: AccountId,
    filename: string,
    fileHash: string,
    mapping: ColumnMapping
  ): Promise<ImportBatch> {
    const now = new Date();
    const document = {
      userId,
      accountId: new Types.ObjectId(accountId),
      filename,
      fileHash,
      mapping,
      status: "pending" as const,
      stats: EMPTY_STATS,
      createdAt: now,
      updatedAt: now
    };
    const result = await this.database().collection(IMPORT_BATCHES_COLLECTION).insertOne(document);
    return this.toImportBatch({ _id: result.insertedId, ...document });
  }

  async findById(userId: string, batchId: ImportBatchId): Promise<ImportBatch | null> {
    const batch = await this.database()
      .collection(IMPORT_BATCHES_COLLECTION)
      .findOne({ _id: new Types.ObjectId(batchId), userId });
    return batch === null ? null : this.toImportBatch(batch);
  }

  async findByFileHash(userId: string, fileHash: string): Promise<ImportBatch | null> {
    const batch = await this.database()
      .collection(IMPORT_BATCHES_COLLECTION)
      .findOne({ userId, fileHash });
    return batch === null ? null : this.toImportBatch(batch);
  }

  async list(userId: string): Promise<ImportBatch[]> {
    const batches = await this.database()
      .collection(IMPORT_BATCHES_COLLECTION)
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();
    return batches.map((batch) => this.toImportBatch(batch));
  }

  /**
   * Only the parse job transitions a batch out of "pending" — never a controller.
   * Not wrapped in a Mongo transaction: staged_rows/import_batches are disposable,
   * re-derivable staging data (not the ledger), and the parse job re-clears +
   * re-parses from scratch on every retry, so partial writes here are safe.
   */
  async markParsed(
    batchId: ImportBatchId,
    status: Extract<ImportBatchStatus, "staged" | "failed">,
    stats: ImportBatchStats
  ): Promise<void> {
    await this.database()
      .collection(IMPORT_BATCHES_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(batchId), status: "pending" },
        { $set: { status, stats, updatedAt: new Date() } }
      );
  }

  /**
   * Advances stats.committed by one chunk's worth, inside that chunk's own
   * transaction — so a mid-commit crash leaves stats.committed exactly
   * matching what actually landed, never ahead of it.
   */
  async incrementCommittedCount(
    batchId: ImportBatchId,
    delta: number,
    session: MongoSession
  ): Promise<void> {
    await this.database()
      .collection(IMPORT_BATCHES_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(batchId) },
        { $inc: { "stats.committed": delta }, $set: { updatedAt: new Date() } },
        { session }
      );
  }

  /** Only after every includable row has landed — never mid-commit. */
  async markCommitted(batchId: ImportBatchId): Promise<void> {
    await this.database()
      .collection(IMPORT_BATCHES_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(batchId), status: "staged" },
        { $set: { status: "committed", committedAt: new Date(), updatedAt: new Date() } }
      );
  }

  async markReverted(batchId: ImportBatchId): Promise<void> {
    await this.database()
      .collection(IMPORT_BATCHES_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(batchId), status: "committed" },
        { $set: { status: "reverted", revertedAt: new Date(), updatedAt: new Date() } }
      );
  }

  private toImportBatch(value: Record<string, unknown>): ImportBatch {
    const { _id, accountId, ...rest } = value;
    return ImportBatchSchema.parse({
      id: objectIdString(_id),
      accountId: objectIdString(accountId),
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
