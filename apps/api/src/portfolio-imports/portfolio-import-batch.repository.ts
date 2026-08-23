import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import {
  PortfolioImportBatchSchema,
  type PortfolioImportBatch,
  type PortfolioImportBatchId,
  type PortfolioImportSource,
  type PortfolioImportStatus
} from "@treasury-ops/shared";
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { DATABASE_CONNECTION, type DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { portfolioImportBatches } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";

export type CreatePortfolioImportBatchInput = Readonly<{
  source: PortfolioImportSource;
  filename: string;
  fileHash: string;
  status: PortfolioImportStatus;
}>;

export type ClaimedPortfolioImportJob = Readonly<{
  batchId: PortfolioImportBatchId;
  userId: string;
  leaseOwner: string;
}>;

export type BatchStagedDates = Readonly<{
  statementAsOf?: Date | undefined;
  coverageFrom?: Date | undefined;
  coverageTo?: Date | undefined;
}>;

export type BatchCounts = Readonly<{
  rowCount: number;
  includedCount: number;
  warningCount: number;
  errorCount: number;
}>;

export const DISCARDABLE_PORTFOLIO_IMPORT_STATUSES = [
  "queued",
  "parsing",
  "needs_review",
  "ready",
  "failed"
] as const satisfies readonly PortfolioImportStatus[];

@Injectable()
export class PortfolioImportBatchRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    input: CreatePortfolioImportBatchInput,
    tx: DbTx
  ): Promise<PortfolioImportBatch> {
    const [row] = await tx
      .insert(portfolioImportBatches)
      .values({
        userId,
        source: input.source,
        filename: input.filename,
        fileHash: input.fileHash,
        status: input.status,
        rowCount: 0,
        includedCount: 0,
        warningCount: 0,
        errorCount: 0,
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    if (row === undefined) throw new Error("Portfolio import batch insert did not return a row.");
    return PortfolioImportBatchSchema.parse(stripNulls(row));
  }

  async findById(
    userId: string,
    batchId: PortfolioImportBatchId,
    tx?: DbTx
  ): Promise<PortfolioImportBatch | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(portfolioImportBatches)
      .where(
        and(eq(portfolioImportBatches.userId, userId), eq(portfolioImportBatches.id, batchId))
      );
    return row === undefined ? null : PortfolioImportBatchSchema.parse(stripNulls(row));
  }

  async findByIdForUpdate(
    userId: string,
    batchId: PortfolioImportBatchId,
    tx: DbTx
  ): Promise<PortfolioImportBatch | null> {
    const [row] = await tx
      .select()
      .from(portfolioImportBatches)
      .where(and(eq(portfolioImportBatches.userId, userId), eq(portfolioImportBatches.id, batchId)))
      .for("update");
    return row === undefined ? null : PortfolioImportBatchSchema.parse(stripNulls(row));
  }

  async findActiveByFileHash(
    userId: string,
    fileHash: string
  ): Promise<PortfolioImportBatch | null> {
    const [row] = await this.db
      .select()
      .from(portfolioImportBatches)
      .where(
        and(
          eq(portfolioImportBatches.userId, userId),
          eq(portfolioImportBatches.fileHash, fileHash),
          inArray(portfolioImportBatches.status, [
            "queued",
            "parsing",
            "needs_review",
            "ready",
            "committing",
            "reverting"
          ])
        )
      );
    return row === undefined ? null : PortfolioImportBatchSchema.parse(stripNulls(row));
  }

  async list(userId: string): Promise<PortfolioImportBatch[]> {
    const rows = await this.db
      .select()
      .from(portfolioImportBatches)
      .where(eq(portfolioImportBatches.userId, userId))
      .orderBy(desc(portfolioImportBatches.createdAt));
    return rows.map((row) => PortfolioImportBatchSchema.parse(stripNulls(row)));
  }

  /**
   * Worker-only cross-tenant discovery for queued or expired-lease batches.
   * Returns owning userId; subsequent writes remain tenant-scoped.
   */
  async systemClaimReady(
    now: Date,
    leaseUntil: Date,
    limit: number,
    tx: DbTx
  ): Promise<ClaimedPortfolioImportJob[]> {
    const rows = await tx
      .select({
        id: portfolioImportBatches.id,
        userId: portfolioImportBatches.userId
      })
      .from(portfolioImportBatches)
      .where(
        and(
          lt(portfolioImportBatches.attemptCount, 5),
          or(
            and(
              eq(portfolioImportBatches.status, "queued"),
              or(
                isNull(portfolioImportBatches.leaseExpiresAt),
                lte(portfolioImportBatches.leaseExpiresAt, now)
              )
            ),
            and(
              eq(portfolioImportBatches.status, "parsing"),
              or(
                isNull(portfolioImportBatches.leaseExpiresAt),
                lte(portfolioImportBatches.leaseExpiresAt, now)
              )
            )
          )
        )
      )
      .limit(limit)
      .for("update", { skipLocked: true });

    const claims: ClaimedPortfolioImportJob[] = [];
    for (const row of rows) {
      const leaseOwner = randomUUID();
      await tx
        .update(portfolioImportBatches)
        .set({
          status: "parsing",
          leaseOwner,
          leaseExpiresAt: leaseUntil,
          attemptCount: sql`${portfolioImportBatches.attemptCount} + 1`,
          updatedAt: now
        })
        .where(eq(portfolioImportBatches.id, row.id));
      claims.push({ batchId: row.id, userId: row.userId, leaseOwner });
    }
    return claims;
  }

  async startParsing(
    userId: string,
    batchId: PortfolioImportBatchId,
    leaseOwner: string,
    leaseExpiresAt: Date,
    tx: DbTx
  ): Promise<boolean> {
    const rows = await tx
      .update(portfolioImportBatches)
      .set({
        status: "parsing",
        leaseOwner,
        leaseExpiresAt,
        attemptCount: sql`${portfolioImportBatches.attemptCount} + 1`,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(portfolioImportBatches.userId, userId),
          eq(portfolioImportBatches.id, batchId),
          inArray(portfolioImportBatches.status, ["queued", "parsing", "failed"])
        )
      )
      .returning({ id: portfolioImportBatches.id });
    return rows.length === 1;
  }

  async markStaged(
    userId: string,
    batchId: PortfolioImportBatchId,
    counts: BatchCounts,
    dates: BatchStagedDates,
    status: Extract<PortfolioImportStatus, "ready" | "needs_review">,
    tx: DbTx
  ): Promise<void> {
    await tx
      .update(portfolioImportBatches)
      .set({
        status,
        rowCount: counts.rowCount,
        includedCount: counts.includedCount,
        warningCount: counts.warningCount,
        errorCount: counts.errorCount,
        ...(dates.statementAsOf === undefined ? {} : { statementAsOf: dates.statementAsOf }),
        ...(dates.coverageFrom === undefined ? {} : { coverageFrom: dates.coverageFrom }),
        ...(dates.coverageTo === undefined ? {} : { coverageTo: dates.coverageTo }),
        leaseOwner: null,
        leaseExpiresAt: null,
        failureCode: null,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(portfolioImportBatches.userId, userId),
          eq(portfolioImportBatches.id, batchId),
          eq(portfolioImportBatches.status, "parsing")
        )
      );
  }

  async markFailed(
    userId: string,
    batchId: PortfolioImportBatchId,
    failureCode: string,
    tx?: DbTx
  ): Promise<void> {
    const executor = tx ?? this.db;
    await executor
      .update(portfolioImportBatches)
      .set({
        status: "failed",
        failureCode,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date()
      })
      .where(
        and(eq(portfolioImportBatches.userId, userId), eq(portfolioImportBatches.id, batchId))
      );
  }

  async updateCounts(
    userId: string,
    batchId: PortfolioImportBatchId,
    includedCount: number,
    warningCount: number,
    tx?: DbTx
  ): Promise<void> {
    const executor = tx ?? this.db;
    await executor
      .update(portfolioImportBatches)
      .set({ includedCount, warningCount, updatedAt: new Date() })
      .where(
        and(eq(portfolioImportBatches.userId, userId), eq(portfolioImportBatches.id, batchId))
      );
  }

  async startCommitting(
    userId: string,
    batchId: PortfolioImportBatchId,
    tx: DbTx
  ): Promise<boolean> {
    const rows = await tx
      .update(portfolioImportBatches)
      .set({
        status: "committing",
        updatedAt: new Date()
      })
      .where(
        and(
          eq(portfolioImportBatches.userId, userId),
          eq(portfolioImportBatches.id, batchId),
          inArray(portfolioImportBatches.status, ["ready", "needs_review"])
        )
      )
      .returning({ id: portfolioImportBatches.id });
    return rows.length === 1;
  }

  async markCommitted(userId: string, batchId: PortfolioImportBatchId, tx: DbTx): Promise<void> {
    await tx
      .update(portfolioImportBatches)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(portfolioImportBatches.userId, userId),
          eq(portfolioImportBatches.id, batchId),
          eq(portfolioImportBatches.status, "committing")
        )
      );
  }

  async startReverting(
    userId: string,
    batchId: PortfolioImportBatchId,
    tx: DbTx
  ): Promise<boolean> {
    const rows = await tx
      .update(portfolioImportBatches)
      .set({
        status: "reverting",
        updatedAt: new Date()
      })
      .where(
        and(
          eq(portfolioImportBatches.userId, userId),
          eq(portfolioImportBatches.id, batchId),
          eq(portfolioImportBatches.status, "completed")
        )
      )
      .returning({ id: portfolioImportBatches.id });
    return rows.length === 1;
  }

  async markReverted(userId: string, batchId: PortfolioImportBatchId, tx: DbTx): Promise<void> {
    await tx
      .update(portfolioImportBatches)
      .set({
        status: "reverted",
        updatedAt: new Date()
      })
      .where(
        and(
          eq(portfolioImportBatches.userId, userId),
          eq(portfolioImportBatches.id, batchId),
          eq(portfolioImportBatches.status, "reverting")
        )
      );
  }

  async deleteDiscardable(
    userId: string,
    batchId: PortfolioImportBatchId,
    tx: DbTx
  ): Promise<boolean> {
    const rows = await tx
      .delete(portfolioImportBatches)
      .where(
        and(
          eq(portfolioImportBatches.userId, userId),
          eq(portfolioImportBatches.id, batchId),
          inArray(portfolioImportBatches.status, DISCARDABLE_PORTFOLIO_IMPORT_STATUSES)
        )
      )
      .returning({ id: portfolioImportBatches.id });
    return rows.length === 1;
  }
}
