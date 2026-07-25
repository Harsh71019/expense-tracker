import { Inject, Injectable } from "@nestjs/common";
import {
  BillStatementRowPageSchema,
  BillStatementRowSchema,
  BillStatementStatsSchema,
  BillStatementUploadSchema,
  type BillStatementRow,
  type BillStatementRowId,
  type BillStatementRowMatchStatus,
  type BillStatementStats,
  type BillStatementUpload,
  type BillStatementUploadId,
  type BillStatementUploadStatus,
  type ColumnMapping,
  type CreditCardBillId,
  type ListBillStatementRowsQuery,
  type ParsedRow,
  type TransactionId,
  type UpdateBillStatementRow
} from "@treasury-ops/shared";
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { billStatementRows, billStatementUploads } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";
import { InvalidCursorError } from "../common/errors/invalid-cursor.error.js";

const StatementRowCursorSchema = z.object({ id: z.string().uuid() });

export type NewBillStatementRow = Readonly<{
  rowNumber: number;
  raw: Record<string, string>;
  parsed?: ParsedRow;
  matchedTransactionId?: TransactionId;
  matchStatus: BillStatementRowMatchStatus;
  problems: readonly string[];
}>;

@Injectable()
export class BillStatementRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async createActive(
    userId: string,
    billId: CreditCardBillId,
    filename: string,
    fileHash: string,
    mapping: ColumnMapping,
    tx: DbTx
  ): Promise<BillStatementUpload> {
    await tx
      .update(billStatementUploads)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(billStatementUploads.userId, userId),
          eq(billStatementUploads.billId, billId),
          eq(billStatementUploads.active, true)
        )
      );

    const [existing] = await tx
      .select()
      .from(billStatementUploads)
      .where(
        and(
          eq(billStatementUploads.userId, userId),
          eq(billStatementUploads.billId, billId),
          eq(billStatementUploads.fileHash, fileHash)
        )
      );

    const now = new Date();
    if (existing !== undefined) {
      const [updated] = await tx
        .update(billStatementUploads)
        .set({
          filename,
          mapping,
          status: "pending",
          active: true,
          statsTotal: 0,
          statsMatched: 0,
          statsMissing: 0,
          statsAmbiguous: 0,
          statsAcknowledged: 0,
          acknowledgedExtraTransactionIds: [],
          updatedAt: now
        })
        .where(
          and(eq(billStatementUploads.userId, userId), eq(billStatementUploads.id, existing.id))
        )
        .returning();
      if (updated === undefined) throw new Error("Statement upload update did not return a row.");
      return toUpload(updated);
    }

    const [created] = await tx
      .insert(billStatementUploads)
      .values({
        userId,
        billId,
        filename,
        fileHash,
        mapping,
        status: "pending",
        active: true,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (created === undefined) throw new Error("Statement upload insert did not return a row.");
    return toUpload(created);
  }

  async findActiveByBillId(
    userId: string,
    billId: CreditCardBillId,
    tx?: DbTx
  ): Promise<BillStatementUpload | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(billStatementUploads)
      .where(
        and(
          eq(billStatementUploads.userId, userId),
          eq(billStatementUploads.billId, billId),
          eq(billStatementUploads.active, true)
        )
      );
    return row === undefined ? null : toUpload(row);
  }

  async findById(
    userId: string,
    uploadId: BillStatementUploadId,
    tx?: DbTx
  ): Promise<BillStatementUpload | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(billStatementUploads)
      .where(and(eq(billStatementUploads.userId, userId), eq(billStatementUploads.id, uploadId)));
    return row === undefined ? null : toUpload(row);
  }

  async deleteRows(userId: string, uploadId: BillStatementUploadId): Promise<void> {
    await this.db
      .delete(billStatementRows)
      .where(and(eq(billStatementRows.userId, userId), eq(billStatementRows.uploadId, uploadId)));
  }

  async insertRows(
    userId: string,
    uploadId: BillStatementUploadId,
    rows: readonly NewBillStatementRow[],
    tx: DbTx
  ): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date();
    await tx.insert(billStatementRows).values(
      rows.map((row) => ({
        userId,
        uploadId,
        rowNumber: row.rowNumber,
        raw: row.raw,
        parsedOccurredAt: row.parsed?.occurredAt ?? null,
        parsedAmountMinor: row.parsed?.amountMinor ?? null,
        parsedType: row.parsed?.type ?? null,
        parsedDescription: row.parsed?.description ?? null,
        matchedTransactionId: row.matchedTransactionId ?? null,
        matchStatus: row.matchStatus,
        acknowledged: false,
        problems: [...row.problems],
        createdAt: now,
        updatedAt: now
      }))
    );
  }

  async markProcessed(
    userId: string,
    uploadId: BillStatementUploadId,
    status: BillStatementUploadStatus,
    stats: BillStatementStats
  ): Promise<void> {
    await this.db
      .update(billStatementUploads)
      .set({
        status,
        statsTotal: stats.total,
        statsMatched: stats.matched,
        statsMissing: stats.missing,
        statsAmbiguous: stats.ambiguous,
        statsAcknowledged: stats.acknowledged,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(billStatementUploads.userId, userId),
          eq(billStatementUploads.id, uploadId),
          eq(billStatementUploads.active, true)
        )
      );
  }

  async findRows(
    userId: string,
    uploadId: BillStatementUploadId,
    query: ListBillStatementRowsQuery
  ): Promise<z.infer<typeof BillStatementRowPageSchema>> {
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const conditions = [
      eq(billStatementRows.userId, userId),
      eq(billStatementRows.uploadId, uploadId)
    ];
    if (query.matchStatus !== undefined) {
      conditions.push(eq(billStatementRows.matchStatus, query.matchStatus));
    }
    if (query.acknowledged !== undefined) {
      conditions.push(eq(billStatementRows.acknowledged, query.acknowledged));
    }
    if (cursor !== null) conditions.push(gt(billStatementRows.id, cursor.id));

    const rows = await this.db
      .select()
      .from(billStatementRows)
      .where(and(...conditions))
      .orderBy(asc(billStatementRows.id))
      .limit(query.limit + 1);
    const items = rows.slice(0, query.limit).map(toRow);
    const last = items.at(-1);
    const hasMore = rows.length > query.limit;
    return BillStatementRowPageSchema.parse({
      items,
      pageInfo: {
        nextCursor: hasMore && last !== undefined ? encodeCursor(last.id) : null,
        hasMore,
        limit: query.limit
      }
    });
  }

  async updateRow(
    userId: string,
    uploadId: BillStatementUploadId,
    rowId: BillStatementRowId,
    patch: UpdateBillStatementRow,
    tx: DbTx
  ): Promise<BillStatementRow | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.acknowledged !== undefined) set.acknowledged = patch.acknowledged;
    if (patch.matchedTransactionId !== undefined) {
      set.matchedTransactionId = patch.matchedTransactionId;
      set.matchStatus = patch.matchedTransactionId === null ? "ambiguous" : "matched";
      set.acknowledged = false;
    }
    const [row] = await tx
      .update(billStatementRows)
      .set(set)
      .where(
        and(
          eq(billStatementRows.userId, userId),
          eq(billStatementRows.uploadId, uploadId),
          eq(billStatementRows.id, rowId)
        )
      )
      .returning();
    return row === undefined ? null : toRow(row);
  }

  async findRow(
    userId: string,
    uploadId: BillStatementUploadId,
    rowId: BillStatementRowId,
    tx?: DbTx
  ): Promise<BillStatementRow | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(billStatementRows)
      .where(
        and(
          eq(billStatementRows.userId, userId),
          eq(billStatementRows.uploadId, uploadId),
          eq(billStatementRows.id, rowId)
        )
      );
    return row === undefined ? null : toRow(row);
  }

  async recomputeStats(
    userId: string,
    uploadId: BillStatementUploadId,
    tx: DbTx
  ): Promise<BillStatementStats> {
    const rows = await tx
      .select({
        matchStatus: billStatementRows.matchStatus,
        acknowledged: billStatementRows.acknowledged
      })
      .from(billStatementRows)
      .where(and(eq(billStatementRows.userId, userId), eq(billStatementRows.uploadId, uploadId)));
    const stats = statsFor(rows);
    await tx
      .update(billStatementUploads)
      .set({
        statsTotal: stats.total,
        statsMatched: stats.matched,
        statsMissing: stats.missing,
        statsAmbiguous: stats.ambiguous,
        statsAcknowledged: stats.acknowledged,
        updatedAt: new Date()
      })
      .where(and(eq(billStatementUploads.userId, userId), eq(billStatementUploads.id, uploadId)));
    return stats;
  }

  async findMatchedTransactionIds(
    userId: string,
    uploadId: BillStatementUploadId,
    tx?: DbTx
  ): Promise<Set<TransactionId>> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select({ transactionId: billStatementRows.matchedTransactionId })
      .from(billStatementRows)
      .where(
        and(
          eq(billStatementRows.userId, userId),
          eq(billStatementRows.uploadId, uploadId),
          sql`${billStatementRows.matchedTransactionId} IS NOT NULL`
        )
      );
    return new Set(
      rows
        .map((row) => row.transactionId)
        .filter((transactionId): transactionId is TransactionId => transactionId !== null)
    );
  }

  async setExtraAcknowledgement(
    userId: string,
    uploadId: BillStatementUploadId,
    transactionId: TransactionId,
    acknowledged: boolean,
    tx: DbTx
  ): Promise<void> {
    const [upload] = await tx
      .select()
      .from(billStatementUploads)
      .where(
        and(
          eq(billStatementUploads.userId, userId),
          eq(billStatementUploads.id, uploadId),
          eq(billStatementUploads.active, true)
        )
      )
      .for("update");
    if (upload === undefined) return;
    const ids = new Set(upload.acknowledgedExtraTransactionIds);
    if (acknowledged) ids.add(transactionId);
    else ids.delete(transactionId);
    await tx
      .update(billStatementUploads)
      .set({ acknowledgedExtraTransactionIds: [...ids], updatedAt: new Date() })
      .where(and(eq(billStatementUploads.userId, userId), eq(billStatementUploads.id, uploadId)));
  }

  async rowsByIds(
    userId: string,
    uploadId: BillStatementUploadId,
    rowIds: readonly BillStatementRowId[]
  ): Promise<BillStatementRow[]> {
    if (rowIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(billStatementRows)
      .where(
        and(
          eq(billStatementRows.userId, userId),
          eq(billStatementRows.uploadId, uploadId),
          inArray(billStatementRows.id, [...rowIds])
        )
      );
    return rows.map(toRow);
  }
}

function toUpload(row: typeof billStatementUploads.$inferSelect): BillStatementUpload {
  return BillStatementUploadSchema.parse({
    ...row,
    stats: {
      total: row.statsTotal,
      matched: row.statsMatched,
      missing: row.statsMissing,
      ambiguous: row.statsAmbiguous,
      acknowledged: row.statsAcknowledged
    }
  });
}

function toRow(row: typeof billStatementRows.$inferSelect): BillStatementRow {
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
  return BillStatementRowSchema.parse({
    ...stripNulls(row),
    ...(parsed === undefined ? {} : { parsed })
  });
}

function statsFor(
  rows: ReadonlyArray<{
    matchStatus: BillStatementRowMatchStatus;
    acknowledged: boolean;
  }>
): BillStatementStats {
  return BillStatementStatsSchema.parse({
    total: rows.length,
    matched: rows.filter((row) => row.matchStatus === "matched").length,
    missing: rows.filter((row) => row.matchStatus === "missing_from_ledger").length,
    ambiguous: rows.filter((row) => row.matchStatus === "ambiguous").length,
    acknowledged: rows.filter((row) => row.acknowledged).length
  });
}

function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): z.infer<typeof StatementRowCursorSchema> {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return StatementRowCursorSchema.parse(parsed);
  } catch {
    throw new InvalidCursorError();
  }
}
