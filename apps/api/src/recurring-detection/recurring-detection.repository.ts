import { Inject, Injectable } from "@nestjs/common";
import {
  AlgorithmResourceUsageSchema,
  AlgorithmSufficiencySchema,
  RecurringDetectionInputWatermarkSchema,
  RecurringDetectionRunResultSchema,
  TransactionTypeSchema,
  type RecurringDetectionRunResult
} from "@treasury-ops/shared";
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import {
  detectedRecurringStreamMembers,
  detectedRecurringStreams,
  recurringDetectionRuns,
  transactions
} from "../common/db/schema/index.js";
import { istCalendarDateStartUtc } from "../common/time/ist.js";
import type {
  DetectedStreamOutput,
  DetectionSummary,
  TransactionInput
} from "./detect-recurring-streams.js";
import {
  RECURRING_DETECTION_DISCOVERY_BATCH_SIZE,
  RECURRING_DETECTION_RESOURCE_CONTRACT
} from "./recurring-detection.constants.js";

const SafePositiveAmountSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const HistoryRowSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  type: TransactionTypeSchema,
  description: z.string(),
  amountMinor: SafePositiveAmountSchema,
  occurredAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});
const SystemCandidateSchema = z.object({ userId: z.string().min(1) });

export interface BoundedHistory {
  readonly rows: readonly TransactionInput[];
  readonly rowBudgetHit: boolean;
}

export interface RecurringHistoryBounds {
  readonly lookbackDays: number;
  readonly maxRows: number;
}

export interface StartedDetectionRun {
  readonly result: RecurringDetectionRunResult;
  readonly alreadyFinal: boolean;
}

@Injectable()
export class RecurringDetectionRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async findBoundedHistory(
    userId: string,
    asOf: Date,
    bounds: RecurringHistoryBounds = RECURRING_DETECTION_RESOURCE_CONTRACT
  ): Promise<BoundedHistory> {
    if (
      !Number.isSafeInteger(bounds.lookbackDays) ||
      bounds.lookbackDays < 1 ||
      bounds.lookbackDays > RECURRING_DETECTION_RESOURCE_CONTRACT.lookbackDays
    ) {
      throw new RangeError("Recurring history lookbackDays exceeds the worker contract.");
    }
    if (
      !Number.isSafeInteger(bounds.maxRows) ||
      bounds.maxRows < 1 ||
      bounds.maxRows > RECURRING_DETECTION_RESOURCE_CONTRACT.maxRows
    ) {
      throw new RangeError("Recurring history maxRows exceeds the worker contract.");
    }
    const lookbackStart = new Date(asOf.getTime() - bounds.lookbackDays * 86_400_000);
    const rows = await this.db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        type: transactions.type,
        description: transactions.description,
        amountMinor: transactions.amountMinor,
        occurredAt: transactions.occurredAt,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          isNull(transactions.transferGroupId),
          gte(transactions.occurredAt, lookbackStart),
          lte(transactions.occurredAt, asOf),
          lte(transactions.createdAt, asOf),
          lte(transactions.updatedAt, asOf)
        )
      )
      .orderBy(asc(transactions.occurredAt), asc(transactions.id))
      .limit(bounds.maxRows + 1);
    const parsed = rows.map((row) => HistoryRowSchema.parse(row));
    return {
      rows: parsed.slice(0, bounds.maxRows),
      rowBudgetHit: parsed.length > bounds.maxRows
    };
  }

  /** Worker-only cross-tenant discovery. It returns only owning tenant ids. */
  async systemFindUsersNeedingRefresh(asOf: Date, limit: number): Promise<readonly string[]> {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > RECURRING_DETECTION_DISCOVERY_BATCH_SIZE
    ) {
      throw new RangeError("Recurring discovery limit exceeds the worker contract.");
    }
    const refreshBefore = istCalendarDateStartUtc(asOf);
    const latestRuns = this.db
      .select({
        userId: recurringDetectionRuns.userId,
        completedAt: sql<Date | null>`max(${recurringDetectionRuns.completedAt})`.as("completed_at")
      })
      .from(recurringDetectionRuns)
      .where(
        or(
          eq(recurringDetectionRuns.status, "completed"),
          eq(recurringDetectionRuns.status, "degraded"),
          eq(recurringDetectionRuns.status, "abstained")
        )
      )
      .groupBy(recurringDetectionRuns.userId)
      .as("latest_recurring_detection_runs");
    const rows = await this.db
      .select({ userId: transactions.userId })
      .from(transactions)
      .leftJoin(latestRuns, eq(latestRuns.userId, transactions.userId))
      .where(
        and(
          eq(transactions.status, "posted"),
          isNull(transactions.transferGroupId),
          lte(transactions.occurredAt, asOf),
          lte(transactions.createdAt, asOf),
          lte(transactions.updatedAt, asOf),
          or(isNull(latestRuns.completedAt), lt(latestRuns.completedAt, refreshBefore))
        )
      )
      .groupBy(transactions.userId, latestRuns.completedAt)
      .orderBy(asc(transactions.userId))
      .limit(limit);
    return rows.map((row) => SystemCandidateSchema.parse(row).userId);
  }

  async beginOrResumeRun(
    userId: string,
    asOf: Date,
    summary: DetectionSummary,
    startedAt: Date
  ): Promise<StartedDetectionRun> {
    const [inserted] = await this.db
      .insert(recurringDetectionRuns)
      .values({
        userId,
        detectorVersion: summary.detectorVersion,
        asOf,
        inputDigest: summary.inputWatermark.digest,
        inputWatermark: summary.inputWatermark,
        status: "running",
        sufficiency: summary.sufficiency,
        resources: summary.resources,
        candidateCount: summary.candidateCount,
        matureCount: summary.matureCount,
        staleCount: summary.staleCount,
        abstainedGroupCount: summary.abstainedGroupCount,
        processedStreamCount: 0,
        totalStreamCount: summary.candidateCount + summary.matureCount + summary.staleCount,
        startedAt,
        completedAt: null,
        failureCode: null
      })
      .onConflictDoNothing()
      .returning();
    if (inserted !== undefined) {
      return { result: toRunResult(inserted), alreadyFinal: false };
    }
    const [existing] = await this.db
      .select()
      .from(recurringDetectionRuns)
      .where(
        and(
          eq(recurringDetectionRuns.userId, userId),
          eq(recurringDetectionRuns.detectorVersion, summary.detectorVersion),
          eq(recurringDetectionRuns.asOf, asOf),
          eq(recurringDetectionRuns.inputDigest, summary.inputWatermark.digest)
        )
      );
    if (existing === undefined) throw new Error("Recurring detection run conflict was not found.");
    return {
      result: toRunResult(existing),
      alreadyFinal:
        existing.status === "completed" ||
        existing.status === "degraded" ||
        existing.status === "abstained"
    };
  }

  async persistStreamRevision(
    userId: string,
    runId: string,
    stream: DetectedStreamOutput,
    computedAt: Date
  ): Promise<void> {
    const streamId = await withTxn(this.db, async (tx) => {
      const [previous] = await tx
        .select({ id: detectedRecurringStreams.id })
        .from(detectedRecurringStreams)
        .where(
          and(
            eq(detectedRecurringStreams.userId, userId),
            eq(detectedRecurringStreams.logicalKey, stream.logicalKey),
            eq(detectedRecurringStreams.detectorVersion, stream.detectorVersion)
          )
        )
        .orderBy(sql`${detectedRecurringStreams.computedAt} desc`)
        .limit(1);
      const [inserted] = await tx
        .insert(detectedRecurringStreams)
        .values({
          userId,
          logicalKey: stream.logicalKey,
          fingerprint: stream.fingerprint,
          detectorVersion: stream.detectorVersion,
          transactionType: stream.transactionType,
          counterpartyKey: stream.counterpartyKey,
          cadence: stream.cadence,
          state: stream.state,
          amountBehavior: stream.amountBehavior,
          confidenceBps: stream.confidenceBps,
          sufficiency: stream.sufficiency,
          evidence: stream.evidence,
          medianAmountMinor: stream.medianAmountMinor,
          madAmountMinor: stream.madAmountMinor,
          nextExpectedDate: stream.nextExpectedDate,
          inputWatermark: stream.inputWatermark,
          supersedesStreamId: previous?.id ?? null,
          computedAt
        })
        .onConflictDoNothing()
        .returning({ id: detectedRecurringStreams.id });
      if (inserted !== undefined) return inserted.id;
      const [existing] = await tx
        .select({ id: detectedRecurringStreams.id })
        .from(detectedRecurringStreams)
        .where(
          and(
            eq(detectedRecurringStreams.userId, userId),
            eq(detectedRecurringStreams.fingerprint, stream.fingerprint),
            eq(detectedRecurringStreams.detectorVersion, stream.detectorVersion)
          )
        );
      if (existing === undefined) throw new Error("Detected stream conflict was not found.");
      return existing.id;
    });

    for (
      let offset = 0;
      offset < stream.members.length;
      offset += RECURRING_DETECTION_RESOURCE_CONTRACT.batchSize
    ) {
      const batch = stream.members.slice(
        offset,
        offset + RECURRING_DETECTION_RESOURCE_CONTRACT.batchSize
      );
      await withTxn(this.db, async (tx) => {
        if (batch.length === 0) return;
        await tx
          .insert(detectedRecurringStreamMembers)
          .values(
            batch.map((member) => ({
              userId,
              streamId,
              transactionId: member.transactionId,
              residualDays: member.residualDays,
              normalizerVersion: stream.evidence.normalizerVersion,
              createdAt: computedAt
            }))
          )
          .onConflictDoNothing();
      });
    }
    await this.updateRunProgress(userId, runId);
  }

  async completeRun(
    userId: string,
    runId: string,
    summary: DetectionSummary,
    completedAt: Date
  ): Promise<RecurringDetectionRunResult> {
    const [row] = await this.db
      .update(recurringDetectionRuns)
      .set({
        status: summary.status,
        sufficiency: summary.sufficiency,
        resources: summary.resources,
        candidateCount: summary.candidateCount,
        matureCount: summary.matureCount,
        staleCount: summary.staleCount,
        abstainedGroupCount: summary.abstainedGroupCount,
        processedStreamCount: summary.candidateCount + summary.matureCount + summary.staleCount,
        totalStreamCount: summary.candidateCount + summary.matureCount + summary.staleCount,
        completedAt,
        failureCode: null
      })
      .where(and(eq(recurringDetectionRuns.id, runId), eq(recurringDetectionRuns.userId, userId)))
      .returning();
    if (row === undefined) throw new Error("Recurring detection run completion did not match.");
    return toRunResult(row);
  }

  async markRunFailed(userId: string, runId: string, failureCode: string): Promise<void> {
    await this.db
      .update(recurringDetectionRuns)
      .set({ status: "failed", completedAt: new Date(), failureCode })
      .where(
        and(
          eq(recurringDetectionRuns.id, runId),
          eq(recurringDetectionRuns.userId, userId),
          eq(recurringDetectionRuns.status, "running")
        )
      );
  }

  private async updateRunProgress(userId: string, runId: string): Promise<void> {
    await this.db
      .update(recurringDetectionRuns)
      .set({
        processedStreamCount: sql`least(${recurringDetectionRuns.totalStreamCount}, ${recurringDetectionRuns.processedStreamCount} + 1)`
      })
      .where(and(eq(recurringDetectionRuns.id, runId), eq(recurringDetectionRuns.userId, userId)));
  }
}

type DetectionRunRow = typeof recurringDetectionRuns.$inferSelect;

function toRunResult(row: DetectionRunRow): RecurringDetectionRunResult {
  return RecurringDetectionRunResultSchema.parse({
    id: row.id,
    detectorVersion: row.detectorVersion,
    status: row.status,
    asOf: row.asOf,
    inputWatermark: RecurringDetectionInputWatermarkSchema.parse(row.inputWatermark),
    sufficiency: AlgorithmSufficiencySchema.parse(row.sufficiency),
    resources: AlgorithmResourceUsageSchema.parse(row.resources),
    candidateCount: row.candidateCount,
    matureCount: row.matureCount,
    staleCount: row.staleCount,
    abstainedGroupCount: row.abstainedGroupCount,
    processedStreamCount: row.processedStreamCount,
    totalStreamCount: row.totalStreamCount,
    startedAt: row.startedAt,
    completedAt: row.completedAt
  });
}
