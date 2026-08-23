import { Inject, Injectable } from "@nestjs/common";
import {
  PortfolioImportRowSchema,
  type PortfolioImportBatchId,
  type PortfolioImportRow,
  type PortfolioImportRowId,
  type PortfolioImportRowPage,
  type UpdatePortfolioImportRow
} from "@treasury-ops/shared";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION, type DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { portfolioImportRows } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import { decodeCursorPayload, encodeCursorPayload } from "../common/pagination/cursor.js";
import type { StagedCasRowInput } from "./portfolio-import-matcher.service.js";

const CursorPayloadSchema = z.object({ rowNumber: z.number().int().positive() });

@Injectable()
export class PortfolioImportRowRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async deleteAllForBatch(
    userId: string,
    batchId: PortfolioImportBatchId,
    tx?: DbTx
  ): Promise<void> {
    const executor = tx ?? this.db;
    await executor
      .delete(portfolioImportRows)
      .where(and(eq(portfolioImportRows.userId, userId), eq(portfolioImportRows.batchId, batchId)));
  }

  async insertChunk(
    userId: string,
    batchId: PortfolioImportBatchId,
    rows: readonly StagedCasRowInput[],
    tx: DbTx
  ): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date();
    await tx.insert(portfolioImportRows).values(
      rows.map((row) => ({
        userId,
        batchId,
        rowNumber: row.rowNumber,
        rowKind: row.rowKind,
        semanticFingerprint: row.semanticFingerprint,
        instrumentType: row.instrumentType,
        isin: row.isin ?? null,
        schemeCode: row.schemeCode ?? null,
        displayName: row.displayName,
        folioReferenceMasked: row.folioReferenceMasked ?? null,
        transactionType: row.transactionType ?? null,
        occurredAt: row.occurredAt ?? null,
        quantityMicroUnits: row.quantityMicroUnits,
        grossAmountMinor: row.grossAmountMinor ?? null,
        navMicroRupeesPerUnit: row.navMicroRupeesPerUnit ?? null,
        proposedAssetId: row.proposedAssetId ?? null,
        matchStatus: row.matchStatus,
        proposedAction: row.proposedAction,
        include: row.include,
        warningCode: row.warningCode ?? null,
        createdAt: now
      }))
    );
  }

  async findPageByBatch(
    userId: string,
    batchId: PortfolioImportBatchId,
    cursor: string | undefined,
    limit: number
  ): Promise<PortfolioImportRowPage> {
    const afterRowNumber =
      cursor === undefined ? null : decodeCursorPayload(cursor, CursorPayloadSchema).rowNumber;
    const conditions = [
      eq(portfolioImportRows.userId, userId),
      eq(portfolioImportRows.batchId, batchId)
    ];
    if (afterRowNumber !== null) conditions.push(gt(portfolioImportRows.rowNumber, afterRowNumber));

    const rows = await this.db
      .select()
      .from(portfolioImportRows)
      .where(and(...conditions))
      .orderBy(asc(portfolioImportRows.rowNumber))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const items = page.map((row) => PortfolioImportRowSchema.parse(stripNulls(row)));
    const last = items.at(-1);
    const hasMore = rows.length > limit;
    const nextCursor =
      hasMore && last !== undefined ? encodeCursorPayload({ rowNumber: last.rowNumber }) : null;

    return { items, pageInfo: { nextCursor, hasMore, limit } };
  }

  async findById(
    userId: string,
    batchId: PortfolioImportBatchId,
    rowId: PortfolioImportRowId,
    tx?: DbTx
  ): Promise<PortfolioImportRow | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(portfolioImportRows)
      .where(
        and(
          eq(portfolioImportRows.userId, userId),
          eq(portfolioImportRows.batchId, batchId),
          eq(portfolioImportRows.id, rowId)
        )
      );
    return row === undefined ? null : PortfolioImportRowSchema.parse(stripNulls(row));
  }

  async listAllForBatch(
    userId: string,
    batchId: PortfolioImportBatchId,
    tx?: DbTx
  ): Promise<PortfolioImportRow[]> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select()
      .from(portfolioImportRows)
      .where(and(eq(portfolioImportRows.userId, userId), eq(portfolioImportRows.batchId, batchId)))
      .orderBy(asc(portfolioImportRows.rowNumber));
    return rows.map((row) => PortfolioImportRowSchema.parse(stripNulls(row)));
  }

  async listIncludableForBatch(
    userId: string,
    batchId: PortfolioImportBatchId,
    tx?: DbTx
  ): Promise<PortfolioImportRow[]> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select()
      .from(portfolioImportRows)
      .where(
        and(
          eq(portfolioImportRows.userId, userId),
          eq(portfolioImportRows.batchId, batchId),
          eq(portfolioImportRows.include, true)
        )
      )
      .orderBy(asc(portfolioImportRows.rowNumber));
    return rows.map((row) => PortfolioImportRowSchema.parse(stripNulls(row)));
  }

  async updateReviewState(
    userId: string,
    batchId: PortfolioImportBatchId,
    rowId: PortfolioImportRowId,
    patch: UpdatePortfolioImportRow,
    tx?: DbTx
  ): Promise<PortfolioImportRow | null> {
    const executor = tx ?? this.db;
    const set: Record<string, unknown> = {};
    if (patch.proposedAssetId !== undefined) {
      set.proposedAssetId = patch.proposedAssetId;
      if (patch.proposedAssetId !== null) {
        set.matchStatus = "matched";
      }
    }
    if (patch.proposedAction !== undefined) set.proposedAction = patch.proposedAction;
    if (patch.include !== undefined) set.include = patch.include;

    const [row] = await executor
      .update(portfolioImportRows)
      .set(set)
      .where(
        and(
          eq(portfolioImportRows.userId, userId),
          eq(portfolioImportRows.batchId, batchId),
          eq(portfolioImportRows.id, rowId)
        )
      )
      .returning();
    return row === undefined ? null : PortfolioImportRowSchema.parse(stripNulls(row));
  }
}
