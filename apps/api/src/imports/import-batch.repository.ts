import { randomUUID } from "node:crypto";

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
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { importBatches } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";
import type { ClaimedImportWorkflow, ImportWorkflowOperation } from "./import-workflow.js";

type CreateWorkflowOptions = Readonly<{
  fileContentBase64: string;
  correlationId: string;
  tx: DbTx;
}>;

type WorkflowPayload = Readonly<{
  accountId: AccountId;
  mapping: ColumnMapping;
  fileContentBase64: string;
}>;

const QUEUED_WORKFLOW_STATUSES = ["pending_parse", "commit_queued", "revert_queued"] as const;
const RUNNING_WORKFLOW_STATUSES = ["parsing", "committing", "reverting"] as const;
const MAX_WORKFLOW_CLAIMS = 5;

/**
 * A batch is only deletable while it holds no live ledger effect and no
 * in-flight workflow: never mid parse/commit/revert (a delete racing a
 * worker could strand its claim), never "committed" (its rows are real
 * posted transactions — per AGENTS.md §3.2 those are append-only), and never
 * "reverted" either — a revert only appends compensating reversal entries,
 * it never deletes the originals, so a reverted batch's id is still
 * referenced by both the reversed originals and their reversals via
 * `transactions.import_batch_id` (`ON DELETE` intentionally has no cascade
 * there — see `delete()` below). Only a batch that never posted anything
 * (pending, staged, failed) qualifies.
 */
export const DELETABLE_IMPORT_BATCH_STATUSES = ["pending", "staged", "failed"] as const;

@Injectable()
export class ImportBatchRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    accountId: AccountId,
    filename: string,
    fileHash: string,
    mapping: ColumnMapping,
    workflow?: CreateWorkflowOptions
  ): Promise<ImportBatch> {
    const executor = workflow?.tx ?? this.db;
    const [row] = await executor
      .insert(importBatches)
      .values({
        userId,
        accountId,
        filename,
        fileHash,
        mapping,
        fileContentBase64: workflow?.fileContentBase64 ?? null,
        status: workflow === undefined ? "pending" : "pending_parse",
        workflowOperation: workflow === undefined ? null : "parse",
        workflowCorrelationId: workflow?.correlationId ?? null,
        workflowAvailableAt: workflow === undefined ? null : sql`statement_timestamp()`,
        workflowError: null,
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

  async findWorkflowPayload(
    userId: string,
    batchId: ImportBatchId
  ): Promise<WorkflowPayload | null> {
    const [row] = await this.db
      .select({
        accountId: importBatches.accountId,
        mapping: importBatches.mapping,
        fileContentBase64: importBatches.fileContentBase64
      })
      .from(importBatches)
      .where(and(eq(importBatches.userId, userId), eq(importBatches.id, batchId)));
    if (row === undefined || row.fileContentBase64 === null) return null;
    return {
      accountId: row.accountId,
      mapping: ColumnMappingSchema.parse(row.mapping),
      fileContentBase64: row.fileContentBase64
    };
  }

  async systemClaimReady(
    now: Date,
    leaseUntil: Date,
    limit: number,
    tx: DbTx
  ): Promise<ClaimedImportWorkflow[]> {
    const rows = await tx
      .select({
        batchId: importBatches.id,
        userId: importBatches.userId,
        operation: importBatches.workflowOperation,
        correlationId: importBatches.workflowCorrelationId
      })
      .from(importBatches)
      .where(
        and(
          lt(importBatches.workflowAttempts, MAX_WORKFLOW_CLAIMS),
          or(
            and(
              inArray(importBatches.status, QUEUED_WORKFLOW_STATUSES),
              or(
                isNull(importBatches.workflowAvailableAt),
                lte(importBatches.workflowAvailableAt, now)
              )
            ),
            and(
              inArray(importBatches.status, RUNNING_WORKFLOW_STATUSES),
              or(
                isNull(importBatches.workflowLeaseUntil),
                lte(importBatches.workflowLeaseUntil, now)
              )
            ),
            and(
              eq(importBatches.status, "failed"),
              or(
                isNull(importBatches.workflowAvailableAt),
                lte(importBatches.workflowAvailableAt, now)
              )
            )
          )
        )
      )
      .limit(limit)
      .for("update", { skipLocked: true });

    const claims: ClaimedImportWorkflow[] = [];
    for (const row of rows) {
      const operation = parseWorkflowOperation(row.operation);
      if (operation === null) continue;
      const claimToken = randomUUID();
      await tx
        .update(importBatches)
        .set({
          status: queuedStatus(operation),
          workflowToken: claimToken,
          workflowLeaseUntil: leaseUntil,
          workflowAvailableAt: null,
          workflowAttempts: sql`${importBatches.workflowAttempts} + 1`,
          workflowError: null,
          updatedAt: now
        })
        .where(eq(importBatches.id, row.batchId));
      claims.push({
        batchId: row.batchId,
        userId: row.userId,
        operation,
        claimToken,
        correlationId: row.correlationId ?? claimToken
      });
    }
    return claims;
  }

  async releaseWorkflowClaim(
    userId: string,
    batchId: ImportBatchId,
    claimToken: string,
    availableAt: Date
  ): Promise<void> {
    await this.db
      .update(importBatches)
      .set({
        workflowToken: null,
        workflowLeaseUntil: null,
        workflowAvailableAt: availableAt,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          eq(importBatches.workflowToken, claimToken)
        )
      );
  }

  async startWorkflow(
    userId: string,
    batchId: ImportBatchId,
    operation: ImportWorkflowOperation,
    claimToken: string,
    leaseUntil: Date
  ): Promise<boolean> {
    const rows = await this.db
      .update(importBatches)
      .set({
        status: runningStatus(operation),
        workflowLeaseUntil: leaseUntil,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          eq(importBatches.workflowOperation, operation),
          eq(importBatches.workflowToken, claimToken),
          inArray(importBatches.status, [
            queuedStatus(operation),
            runningStatus(operation),
            "failed"
          ])
        )
      )
      .returning({ id: importBatches.id });
    return rows.length === 1;
  }

  async heartbeatWorkflow(
    userId: string,
    batchId: ImportBatchId,
    claimToken: string,
    leaseUntil: Date
  ): Promise<boolean> {
    const rows = await this.db
      .update(importBatches)
      .set({ workflowLeaseUntil: leaseUntil, updatedAt: new Date() })
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          eq(importBatches.workflowToken, claimToken)
        )
      )
      .returning({ id: importBatches.id });
    return rows.length === 1;
  }

  async completeWorkflow(
    userId: string,
    batchId: ImportBatchId,
    operation: ImportWorkflowOperation,
    claimToken: string,
    status: Extract<ImportBatchStatus, "staged" | "committed" | "reverted" | "failed">,
    stats?: ImportBatchStats
  ): Promise<void> {
    await this.db
      .update(importBatches)
      .set({
        status,
        workflowOperation: null,
        workflowCorrelationId: null,
        workflowToken: null,
        workflowLeaseUntil: null,
        workflowAvailableAt: null,
        workflowError: null,
        ...(operation === "parse" ? { fileContentBase64: null } : {}),
        ...(stats === undefined
          ? {}
          : {
              statsTotal: stats.total,
              statsStaged: stats.staged,
              statsDuplicates: stats.duplicates,
              statsCommitted: stats.committed
            }),
        ...(status === "committed" ? { committedAt: new Date() } : {}),
        ...(status === "reverted" ? { revertedAt: new Date() } : {}),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          eq(importBatches.workflowToken, claimToken),
          eq(importBatches.workflowOperation, operation)
        )
      );
  }

  async failWorkflow(
    userId: string,
    batchId: ImportBatchId,
    operation: ImportWorkflowOperation,
    claimToken: string,
    errorSummary: string,
    availableAt: Date
  ): Promise<void> {
    await this.db
      .update(importBatches)
      .set({
        status: "failed",
        workflowToken: null,
        workflowLeaseUntil: null,
        workflowAvailableAt: availableAt,
        workflowError: errorSummary.slice(0, 500),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          eq(importBatches.workflowOperation, operation),
          eq(importBatches.workflowToken, claimToken)
        )
      );
  }

  async queueWorkflow(
    userId: string,
    batchId: ImportBatchId,
    operation: Extract<ImportWorkflowOperation, "commit" | "revert">,
    correlationId: string
  ): Promise<boolean> {
    const requiredStatus = operation === "commit" ? "staged" : "committed";
    const rows = await this.db
      .update(importBatches)
      .set({
        status: queuedStatus(operation),
        workflowOperation: operation,
        workflowCorrelationId: correlationId,
        workflowToken: null,
        workflowLeaseUntil: null,
        workflowAvailableAt: new Date(),
        workflowAttempts: 0,
        workflowError: null,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          or(
            eq(importBatches.status, requiredStatus),
            and(eq(importBatches.status, "failed"), eq(importBatches.workflowOperation, operation))
          )
        )
      )
      .returning({ id: importBatches.id });
    return rows.length === 1;
  }

  /**
   * Only the parse job transitions a batch out of "pending" — never a controller.
   */
  async markParsed(
    userId: string,
    batchId: ImportBatchId,
    status: Extract<ImportBatchStatus, "staged" | "failed">,
    stats: ImportBatchStats
  ): Promise<void> {
    await this.db
      .update(importBatches)
      .set({
        status,
        failureCode: status === "failed" ? "invalid_csv" : null,
        failedAt: status === "failed" ? new Date() : null,
        fileContentBase64: null,
        workflowOperation: null,
        workflowCorrelationId: null,
        workflowToken: null,
        workflowLeaseUntil: null,
        workflowAvailableAt: null,
        workflowError: null,
        statsTotal: stats.total,
        statsStaged: stats.staged,
        statsDuplicates: stats.duplicates,
        statsCommitted: stats.committed,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          inArray(importBatches.status, ["pending", "pending_parse", "parsing"])
        )
      );
  }

  async markTerminalParseFailure(userId: string, batchId: ImportBatchId): Promise<void> {
    await this.db
      .update(importBatches)
      .set({
        status: "failed",
        failureCode: "parse_retries_exhausted",
        failedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          eq(importBatches.status, "pending")
        )
      );
  }

  /**
   * Advances stats.committed by one chunk's worth, inside that chunk's own
   * transaction — so a mid-commit crash leaves stats.committed exactly
   * matching what actually landed, never ahead of it.
   */
  async incrementCommittedCount(
    userId: string,
    batchId: ImportBatchId,
    delta: number,
    tx: DbTx
  ): Promise<void> {
    await tx
      .update(importBatches)
      .set({
        statsCommitted: sql`${importBatches.statsCommitted} + ${delta}`,
        updatedAt: new Date()
      })
      .where(and(eq(importBatches.userId, userId), eq(importBatches.id, batchId)));
  }

  /** Only after every includable row has landed — never mid-commit. */
  async markCommitted(userId: string, batchId: ImportBatchId): Promise<void> {
    await this.db
      .update(importBatches)
      .set({ status: "committed", committedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          eq(importBatches.status, "staged")
        )
      );
  }

  async markReverted(userId: string, batchId: ImportBatchId): Promise<void> {
    await this.db
      .update(importBatches)
      .set({ status: "reverted", revertedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          eq(importBatches.status, "committed")
        )
      );
  }

  /**
   * Re-checks `status in DELETABLE_IMPORT_BATCH_STATUSES` inside the same
   * transaction as the row delete, so a batch a worker claims for
   * commit/revert between the service's read and this write is left alone
   * rather than deleted out from under it.
   */
  async delete(userId: string, batchId: ImportBatchId, tx: DbTx): Promise<boolean> {
    const rows = await tx
      .delete(importBatches)
      .where(
        and(
          eq(importBatches.userId, userId),
          eq(importBatches.id, batchId),
          inArray(importBatches.status, DELETABLE_IMPORT_BATCH_STATUSES)
        )
      )
      .returning({ id: importBatches.id });
    return rows.length === 1;
  }
}

function parseWorkflowOperation(value: string | null): ImportWorkflowOperation | null {
  if (value === "parse" || value === "commit" || value === "revert") return value;
  return null;
}

function queuedStatus(
  operation: ImportWorkflowOperation
): Extract<ImportBatchStatus, "pending_parse" | "commit_queued" | "revert_queued"> {
  if (operation === "parse") return "pending_parse";
  if (operation === "commit") return "commit_queued";
  return "revert_queued";
}

function runningStatus(
  operation: ImportWorkflowOperation
): Extract<ImportBatchStatus, "parsing" | "committing" | "reverting"> {
  if (operation === "parse") return "parsing";
  if (operation === "commit") return "committing";
  return "reverting";
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
    failureCode: stripped.failureCode,
    failedAt: stripped.failedAt,
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
