import { Inject, Injectable } from "@nestjs/common";
import {
  ColumnMappingSchema,
  ImportBatchSchema,
  type AccountId,
  type ColumnMapping,
  type ImportBatch,
  type ImportBatchId,
  type ImportBatchStats,
  type ImportBatchStatus
} from "@treasury-ops/shared";
import { and, desc, eq, sql } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { importBatches } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";

@Injectable()
export class ImportBatchRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    accountId: AccountId,
    filename: string,
    fileHash: string,
    mapping: ColumnMapping
  ): Promise<ImportBatch> {
    const [row] = await this.db
      .insert(importBatches)
      .values({
        userId,
        accountId,
        filename,
        fileHash,
        mapping,
        status: "pending",
        statsTotal: 0,
        statsStaged: 0,
        statsDuplicates: 0,
        statsCommitted: 0,
        // PostgreSQL keeps sub-millisecond precision here. JavaScript Date
        // only has millisecond precision, which made two rapid uploads tie
        // on createdAt and let "latest mapping" return the older batch.
        createdAt: sql`statement_timestamp()`,
        updatedAt: sql`statement_timestamp()`
      })
      .returning();
    if (row === undefined) throw new Error("Import batch insert did not return a row.");
    return toImportBatch(row);
  }

  async findById(userId: string, batchId: ImportBatchId): Promise<ImportBatch | null> {
    const [row] = await this.db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)));
    return row === undefined ? null : toImportBatch(row);
  }

  async findByFileHash(userId: string, fileHash: string): Promise<ImportBatch | null> {
    const [row] = await this.db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.userId, userId), eq(importBatches.fileHash, fileHash)));
    return row === undefined ? null : toImportBatch(row);
  }

  async list(userId: string): Promise<ImportBatch[]> {
    const rows = await this.db
      .select()
      .from(importBatches)
      .where(eq(importBatches.userId, userId))
      .orderBy(desc(importBatches.createdAt));
    return rows.map(toImportBatch);
  }

  /**
   * "Column mapping is saved per account" (BACKEND.md §4) is implemented as
   * reusing the most recent batch's mapping for that account — no separate
   * persisted field, no extra write path, always reflects what actually
   * worked last time rather than a value that can drift from real usage.
   */
  async findLatestMappingForAccount(
    userId: string,
    accountId: AccountId
  ): Promise<ColumnMapping | null> {
    const [row] = await this.db
      .select({ mapping: importBatches.mapping })
      .from(importBatches)
      .where(and(eq(importBatches.userId, userId), eq(importBatches.accountId, accountId)))
      .orderBy(desc(importBatches.createdAt))
      .limit(1);
    return row === undefined ? null : ColumnMappingSchema.parse(row.mapping);
  }

  /**
   * Only the parse job transitions a batch out of "pending" — never a controller.
   */
  async markParsed(
    batchId: ImportBatchId,
    status: Extract<ImportBatchStatus, "staged" | "failed">,
    stats: ImportBatchStats
  ): Promise<void> {
    await this.db
      .update(importBatches)
      .set({
        status,
        statsTotal: stats.total,
        statsStaged: stats.staged,
        statsDuplicates: stats.duplicates,
        statsCommitted: stats.committed,
        updatedAt: new Date()
      })
      .where(and(eq(importBatches.id, batchId), eq(importBatches.status, "pending")));
  }

  /**
   * Advances stats.committed by one chunk's worth, inside that chunk's own
   * transaction — so a mid-commit crash leaves stats.committed exactly
   * matching what actually landed, never ahead of it.
   */
  async incrementCommittedCount(batchId: ImportBatchId, delta: number, tx: DbTx): Promise<void> {
    await tx
      .update(importBatches)
      .set({
        statsCommitted: sql`${importBatches.statsCommitted} + ${delta}`,
        updatedAt: new Date()
      })
      .where(eq(importBatches.id, batchId));
  }

  /** Only after every includable row has landed — never mid-commit. */
  async markCommitted(batchId: ImportBatchId): Promise<void> {
    await this.db
      .update(importBatches)
      .set({ status: "committed", committedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(importBatches.id, batchId), eq(importBatches.status, "staged")));
  }

  async markReverted(batchId: ImportBatchId): Promise<void> {
    await this.db
      .update(importBatches)
      .set({ status: "reverted", revertedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(importBatches.id, batchId), eq(importBatches.status, "committed")));
  }
}

function toImportBatch(row: typeof importBatches.$inferSelect): ImportBatch {
  const stripped = stripNulls(row);
  return ImportBatchSchema.parse({
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    filename: row.filename,
    fileHash: row.fileHash,
    mapping: row.mapping,
    status: row.status,
    stats: {
      total: row.statsTotal,
      staged: row.statsStaged,
      duplicates: row.statsDuplicates,
      committed: row.statsCommitted
    },
    committedAt: stripped.committedAt,
    revertedAt: stripped.revertedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}
