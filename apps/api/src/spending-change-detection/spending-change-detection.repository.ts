import { Inject, Injectable } from "@nestjs/common";
import {
  AlgorithmResourceUsageSchema,
  AlgorithmSufficiencySchema,
  DetectedStreamAmountBehaviorSchema,
  DetectedStreamCadenceSchema,
  SpendingChangeRunStatusSchema,
  SpendingChangeDetectionRunResultSchema,
  TransactionTypeSchema,
  type DetectedRecurringStreamChange,
  type SpendingChangeDetectionRunResult,
  type SpendingChangeInputWatermark,
  type SpendingRegime
} from "@treasury-ops/shared";
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import {
  accounts,
  detectedRecurringStreamMembers,
  detectedRecurringStreams,
  detectedRecurringStreamChanges,
  spendingChangeDetectionRuns,
  spendingRegimes,
  transactions
} from "../common/db/schema/index.js";
import { istCalendarDateStartUtc } from "../common/time/ist.js";
import type { MatureStreamInput, TransactionInput } from "./detect-spending-changes.js";
import {
  DETECTOR_VERSION,
  SPENDING_CHANGE_DISCOVERY_BATCH_SIZE,
  SPENDING_CHANGE_RESOURCE_CONTRACT
} from "./spending-change-detection.constants.js";

const SafePositiveAmountSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

const HistoryRowSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  type: TransactionTypeSchema,
  amountMinor: SafePositiveAmountSchema,
  occurredAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  transferGroupId: z.string().uuid().nullable(),
  accountType: z.string().nullable(),
  billId: z.string().uuid().nullable(),
  status: z.enum(["posted", "reversed", "reversal"])
});

const SystemCandidateSchema = z.object({ userId: z.string().min(1) });

export interface BoundedHistory {
  readonly rows: readonly TransactionInput[];
  readonly rowBudgetHit: boolean;
}

export interface SpendingChangeHistoryBounds {
  readonly lookbackDays: number;
  readonly maxRows: number;
}

export interface StartedChangeRun {
  readonly result: SpendingChangeDetectionRunResult;
  readonly alreadyFinal: boolean;
}

@Injectable()
export class SpendingChangeDetectionRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async findBoundedHistory(
    userId: string,
    asOf: Date,
    bounds: SpendingChangeHistoryBounds = SPENDING_CHANGE_RESOURCE_CONTRACT
  ): Promise<BoundedHistory> {
    if (
      !Number.isSafeInteger(bounds.lookbackDays) ||
      bounds.lookbackDays < 1 ||
      bounds.lookbackDays > SPENDING_CHANGE_RESOURCE_CONTRACT.lookbackDays
    ) {
      throw new RangeError("Spending change history lookbackDays exceeds the worker contract.");
    }
    if (
      !Number.isSafeInteger(bounds.maxRows) ||
      bounds.maxRows < 1 ||
      bounds.maxRows > SPENDING_CHANGE_RESOURCE_CONTRACT.maxRows
    ) {
      throw new RangeError("Spending change history maxRows exceeds the worker contract.");
    }

    const lookbackStart = new Date(asOf.getTime() - bounds.lookbackDays * 86_400_000);
    const rows = await this.db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        occurredAt: transactions.occurredAt,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
        transferGroupId: transactions.transferGroupId,
        accountType: accounts.type,
        billId: transactions.billId,
        status: transactions.status
      })
      .from(transactions)
      .leftJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.userId, userId),
          // Receivable principal is balance-sheet movement, not a
          // spending-pattern signal (plan doc §12).
          eq(transactions.purpose, "ordinary"),
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

  async findMatureStreams(userId: string): Promise<readonly MatureStreamInput[]> {
    const matureStreams = await this.db
      .select({
        id: detectedRecurringStreams.id,
        userId: detectedRecurringStreams.userId,
        logicalKey: detectedRecurringStreams.logicalKey,
        fingerprint: detectedRecurringStreams.fingerprint,
        cadence: detectedRecurringStreams.cadence,
        state: detectedRecurringStreams.state,
        amountBehavior: detectedRecurringStreams.amountBehavior,
        medianAmountMinor: detectedRecurringStreams.medianAmountMinor,
        madAmountMinor: detectedRecurringStreams.madAmountMinor
      })
      .from(detectedRecurringStreams)
      .where(
        and(
          eq(detectedRecurringStreams.userId, userId),
          eq(detectedRecurringStreams.state, "mature")
        )
      )
      .orderBy(asc(detectedRecurringStreams.id));

    if (matureStreams.length === 0) return [];

    const streamIds = matureStreams.map((s) => s.id);
    const members = await this.db
      .select({
        id: detectedRecurringStreamMembers.id,
        streamId: detectedRecurringStreamMembers.streamId,
        transactionId: detectedRecurringStreamMembers.transactionId,
        occurredAt: transactions.occurredAt,
        amountMinor: transactions.amountMinor
      })
      .from(detectedRecurringStreamMembers)
      .innerJoin(transactions, eq(transactions.id, detectedRecurringStreamMembers.transactionId))
      .where(
        and(
          eq(detectedRecurringStreamMembers.userId, userId),
          sql`${detectedRecurringStreamMembers.streamId} IN ${streamIds}`
        )
      )
      .orderBy(asc(transactions.occurredAt), asc(transactions.id));

    const membersByStream = new Map<
      string,
      Array<{ id: string; transactionId: string; occurredAt: Date; amountMinor: number }>
    >();

    for (const member of members) {
      const list = membersByStream.get(member.streamId) ?? [];
      list.push({
        id: member.id,
        transactionId: member.transactionId,
        occurredAt: member.occurredAt,
        amountMinor: member.amountMinor
      });
      membersByStream.set(member.streamId, list);
    }

    return matureStreams.map((stream) => ({
      id: stream.id,
      userId: stream.userId,
      logicalKey: stream.logicalKey,
      fingerprint: stream.fingerprint,
      cadence: DetectedStreamCadenceSchema.parse(stream.cadence),
      state: "mature" as const,
      amountBehavior: DetectedStreamAmountBehaviorSchema.parse(stream.amountBehavior),
      medianAmountMinor: stream.medianAmountMinor,
      madAmountMinor: stream.madAmountMinor,
      members: membersByStream.get(stream.id) ?? []
    }));
  }

  /** Worker-only cross-tenant discovery. It returns only owning tenant ids. */
  async systemFindUsersNeedingRefresh(asOf: Date, limit: number): Promise<readonly string[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > SPENDING_CHANGE_DISCOVERY_BATCH_SIZE) {
      throw new RangeError("Spending change discovery limit exceeds the worker contract.");
    }

    const refreshBefore = istCalendarDateStartUtc(asOf);
    const latestRuns = this.db
      .select({
        userId: spendingChangeDetectionRuns.userId,
        completedAt: sql<Date | null>`max(${spendingChangeDetectionRuns.completedAt})`.as(
          "completed_at"
        )
      })
      .from(spendingChangeDetectionRuns)
      .where(
        or(
          eq(spendingChangeDetectionRuns.status, "completed"),
          eq(spendingChangeDetectionRuns.status, "degraded"),
          eq(spendingChangeDetectionRuns.status, "abstained")
        )
      )
      .groupBy(spendingChangeDetectionRuns.userId)
      .as("latest_spending_change_runs");

    const rows = await this.db
      .select({ userId: transactions.userId })
      .from(transactions)
      .leftJoin(latestRuns, eq(latestRuns.userId, transactions.userId))
      .where(
        and(
          eq(transactions.status, "posted"),
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
    watermark: SpendingChangeInputWatermark,
    sufficiency: z.infer<typeof AlgorithmSufficiencySchema>,
    resources: z.infer<typeof AlgorithmResourceUsageSchema>,
    startedAt: Date
  ): Promise<StartedChangeRun> {
    const [inserted] = await this.db
      .insert(spendingChangeDetectionRuns)
      .values({
        userId,
        detectorVersion: DETECTOR_VERSION,
        asOf,
        inputDigest: watermark.digest,
        inputWatermark: watermark,
        status: "running",
        sufficiency,
        resources,
        startedAt
      })
      .onConflictDoNothing({
        target: [
          spendingChangeDetectionRuns.userId,
          spendingChangeDetectionRuns.detectorVersion,
          spendingChangeDetectionRuns.asOf,
          spendingChangeDetectionRuns.inputDigest
        ]
      })
      .returning();

    if (inserted) {
      return {
        result: SpendingChangeDetectionRunResultSchema.parse(inserted),
        alreadyFinal: false
      };
    }

    const existing = await this.db
      .select()
      .from(spendingChangeDetectionRuns)
      .where(
        and(
          eq(spendingChangeDetectionRuns.userId, userId),
          eq(spendingChangeDetectionRuns.detectorVersion, DETECTOR_VERSION),
          eq(spendingChangeDetectionRuns.asOf, asOf),
          eq(spendingChangeDetectionRuns.inputDigest, watermark.digest)
        )
      )
      .limit(1);

    const match = existing[0];
    if (!match) {
      throw new Error("Failed to insert or find spending change detection run.");
    }

    const parsed = SpendingChangeDetectionRunResultSchema.parse(match);
    const alreadyFinal =
      parsed.status === "completed" ||
      parsed.status === "degraded" ||
      parsed.status === "abstained";

    return {
      result: parsed,
      alreadyFinal
    };
  }

  async persistDerivedStreamChanges(
    userId: string,
    changes: readonly DetectedRecurringStreamChange[],
    asOf: Date
  ): Promise<void> {
    if (changes.length === 0) return;

    await withTxn(this.db, async (tx) => {
      for (const change of changes) {
        // Find existing stream to derive from
        const [original] = await tx
          .select()
          .from(detectedRecurringStreams)
          .where(
            and(
              eq(detectedRecurringStreams.userId, userId),
              eq(detectedRecurringStreams.id, change.streamId)
            )
          )
          .limit(1);

        let newStreamId: string | null = null;
        if (original) {
          // Derive a new immutable stream version starting from the change point
          const [derivedStream] = await tx
            .insert(detectedRecurringStreams)
            .values({
              userId,
              logicalKey: original.logicalKey,
              fingerprint: `${original.fingerprint}:v${DETECTOR_VERSION}:${change.evidence.changeOccurredAt.toISOString()}`,
              detectorVersion: DETECTOR_VERSION,
              transactionType: original.transactionType,
              counterpartyKey: original.counterpartyKey,
              cadence: original.cadence,
              state: original.state,
              amountBehavior: original.amountBehavior,
              confidenceBps: change.confidenceBps,
              sufficiency: original.sufficiency,
              evidence: change.evidence,
              medianAmountMinor: change.newMedianMinor,
              madAmountMinor: change.evidence.newMadMinor,
              nextExpectedDate: original.nextExpectedDate,
              inputWatermark: change.inputWatermark,
              supersedesStreamId: original.id,
              computedAt: asOf
            })
            .onConflictDoNothing()
            .returning({ id: detectedRecurringStreams.id });

          if (derivedStream) {
            newStreamId = derivedStream.id;
          }
        }

        // Persist the change record
        await tx
          .insert(detectedRecurringStreamChanges)
          .values({
            id: change.id,
            userId,
            streamId: change.streamId,
            supersedesStreamId: newStreamId,
            oldMedianMinor: change.oldMedianMinor,
            newMedianMinor: change.newMedianMinor,
            deltaMinor: change.deltaMinor,
            direction: change.direction,
            confidenceBps: change.confidenceBps,
            changeOccurredAt: change.changeOccurredAt,
            changeTransactionId: change.changeTransactionId,
            evidence: change.evidence,
            inputWatermark: change.inputWatermark,
            detectorVersion: DETECTOR_VERSION,
            computedAt: change.computedAt
          })
          .onConflictDoNothing();
      }
    });
  }

  async persistSpendingRegimes(userId: string, regimes: readonly SpendingRegime[]): Promise<void> {
    if (regimes.length === 0) return;

    await withTxn(this.db, async (tx) => {
      for (const regime of regimes) {
        await tx
          .insert(spendingRegimes)
          .values({
            id: regime.id,
            userId,
            regimeType: regime.regimeType,
            baselineMedianMinor: regime.baselineMedianMinor,
            newMedianMinor: regime.newMedianMinor,
            deltaMinor: regime.deltaMinor,
            direction: regime.direction,
            confidenceBps: regime.confidenceBps,
            sufficiency: regime.sufficiency,
            changeDate: regime.changeDate,
            occurredAtStart: regime.occurredAtStart,
            occurredAtEnd: regime.occurredAtEnd,
            evidence: regime.evidence,
            inputWatermark: regime.inputWatermark,
            supersedesRegimeId: regime.supersedesRegimeId,
            detectorVersion: DETECTOR_VERSION,
            computedAt: regime.computedAt
          })
          .onConflictDoNothing();
      }
    });
  }

  async completeRun(
    userId: string,
    runId: string,
    counts: {
      recurringChangesCount: number;
      regimesCount: number;
      abstainedCount: number;
      status: z.infer<typeof SpendingChangeRunStatusSchema>;
      sufficiency: z.infer<typeof AlgorithmSufficiencySchema>;
      resources: z.infer<typeof AlgorithmResourceUsageSchema>;
    },
    completedAt: Date
  ): Promise<SpendingChangeDetectionRunResult> {
    const [updated] = await this.db
      .update(spendingChangeDetectionRuns)
      .set({
        status: counts.status,
        sufficiency: counts.sufficiency,
        resources: counts.resources,
        recurringChangesCount: counts.recurringChangesCount,
        regimesCount: counts.regimesCount,
        abstainedCount: counts.abstainedCount,
        completedAt
      })
      .where(
        and(
          eq(spendingChangeDetectionRuns.userId, userId),
          eq(spendingChangeDetectionRuns.id, runId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error(`Spending change run ${runId} was not found for user ${userId}.`);
    }

    return SpendingChangeDetectionRunResultSchema.parse(updated);
  }

  async markRunFailed(userId: string, runId: string, failureCode: string): Promise<void> {
    await this.db
      .update(spendingChangeDetectionRuns)
      .set({
        status: "failed",
        failureCode,
        completedAt: new Date()
      })
      .where(
        and(
          eq(spendingChangeDetectionRuns.userId, userId),
          eq(spendingChangeDetectionRuns.id, runId)
        )
      );
  }
}
