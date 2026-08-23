import { Inject, Injectable } from "@nestjs/common";
import {
  ReviewItemDismissReasonSchema,
  ReviewItemFeedbackActionSchema,
  ReviewItemPriorityFactorsSchema,
  ReviewItemSchema,
  ReviewItemSourceTypeSchema,
  ReviewItemStatusSchema,
  type ListReviewInboxQuery,
  type ReviewInboxPage,
  type ReviewInboxSummary,
  type ReviewItem,
  type ReviewItemDismissReason,
  type ReviewItemFeedbackAction,
  type ReviewItemSourceType
} from "@treasury-ops/shared";
import { and, asc, desc, eq, gt, gte, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import {
  detectedRecurringStreamChanges,
  detectedRecurringStreams,
  reviewInboxItems,
  spendingRegimes,
  transactions
} from "../common/db/schema/index.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import { decodeCursorPayloadOrNull, encodeCursorPayload } from "../common/pagination/cursor.js";
import { calculateReviewPriority } from "./calculate-review-priority.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

const CursorDataSchema = z.tuple([z.number().int(), z.number().int(), z.string().uuid()]);

function encodeCursor(priorityScore: number, occurredAt: Date, id: string): string {
  return encodeCursorPayload([priorityScore, occurredAt.getTime(), id]);
}

function decodeCursor(
  cursor: string
): { priorityScore: number; occurredAt: Date; id: string } | null {
  const parsed = decodeCursorPayloadOrNull(cursor, CursorDataSchema);
  if (parsed === null) return null;
  const [priorityScore, occurredAtMs, id] = parsed;
  return { priorityScore, occurredAt: new Date(occurredAtMs), id };
}

export interface CandidateSourceItem {
  readonly sourceType: ReviewItemSourceType;
  readonly sourceId: string;
  readonly sourceVersion: number;
  readonly confidenceBps: number;
  readonly amountMinor: number | null;
  readonly title: string;
  readonly subtitle: string;
  readonly evidence: Record<string, unknown>;
  readonly inputWatermark: Record<string, unknown>;
  readonly occurredAt: Date;
  readonly customReason?: string;
}

@Injectable()
export class ReviewInboxRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async findPage(userId: string, query: ListReviewInboxQuery): Promise<ReviewInboxPage> {
    const conditions = [eq(reviewInboxItems.userId, userId)];

    if (query.status) {
      conditions.push(eq(reviewInboxItems.status, query.status));
    }
    if (query.sourceType) {
      conditions.push(eq(reviewInboxItems.sourceType, query.sourceType));
    }

    if (query.cursor) {
      const decoded = decodeCursor(query.cursor);
      if (decoded) {
        const cursorCondition = or(
          lt(reviewInboxItems.priorityScore, decoded.priorityScore),
          and(
            eq(reviewInboxItems.priorityScore, decoded.priorityScore),
            lt(reviewInboxItems.occurredAt, decoded.occurredAt)
          ),
          and(
            eq(reviewInboxItems.priorityScore, decoded.priorityScore),
            eq(reviewInboxItems.occurredAt, decoded.occurredAt),
            gt(reviewInboxItems.id, decoded.id)
          )
        );
        if (cursorCondition) {
          conditions.push(cursorCondition);
        }
      }
    }

    const limit = typeof query.limit === "number" ? query.limit : 50;

    const [rows, totalActiveResult] = await Promise.all([
      this.db
        .select()
        .from(reviewInboxItems)
        .where(and(...conditions))
        .orderBy(
          desc(reviewInboxItems.priorityScore),
          desc(reviewInboxItems.occurredAt),
          asc(reviewInboxItems.id)
        )
        .limit(limit + 1),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviewInboxItems)
        .where(and(eq(reviewInboxItems.userId, userId), eq(reviewInboxItems.status, "active")))
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const parsedItems = items.map((r) => this.mapRowToReviewItem(r));
    const lastItem = parsedItems.at(-1);
    const nextCursor =
      hasMore && lastItem
        ? encodeCursor(lastItem.priorityScore, lastItem.occurredAt, lastItem.id)
        : null;

    const totalActive = totalActiveResult[0]?.count ?? 0;

    return {
      items: parsedItems,
      nextCursor,
      totalActive
    };
  }

  async getSummary(userId: string): Promise<ReviewInboxSummary> {
    const [countsResult, highestResult, oldestResult] = await Promise.all([
      this.db
        .select({
          sourceType: reviewInboxItems.sourceType,
          count: sql<number>`count(*)::int`
        })
        .from(reviewInboxItems)
        .where(and(eq(reviewInboxItems.userId, userId), eq(reviewInboxItems.status, "active")))
        .groupBy(reviewInboxItems.sourceType),
      this.db
        .select({
          maxScore: sql<number | null>`max(${reviewInboxItems.priorityScore})`
        })
        .from(reviewInboxItems)
        .where(and(eq(reviewInboxItems.userId, userId), eq(reviewInboxItems.status, "active"))),
      this.db
        .select({
          minOccurredAt: sql<Date | null>`min(${reviewInboxItems.occurredAt})`
        })
        .from(reviewInboxItems)
        .where(and(eq(reviewInboxItems.userId, userId), eq(reviewInboxItems.status, "active")))
    ]);

    let categorySuggestionCount = 0;
    let recurringStreamCount = 0;
    let recurringChangeCount = 0;
    let spendingRegimeCount = 0;
    let activeCount = 0;

    for (const r of countsResult) {
      activeCount += r.count;
      if (r.sourceType === "category_suggestion") categorySuggestionCount = r.count;
      else if (r.sourceType === "recurring_stream") recurringStreamCount = r.count;
      else if (r.sourceType === "recurring_change") recurringChangeCount = r.count;
      else if (r.sourceType === "spending_regime") spendingRegimeCount = r.count;
    }

    const highestPriorityScore = highestResult[0]?.maxScore ?? null;
    const minOccurredAt = oldestResult[0]?.minOccurredAt ?? null;
    const oldestActiveDate = minOccurredAt ? toISTCalendarDate(new Date(minOccurredAt)) : null;

    return {
      activeCount,
      categorySuggestionCount,
      recurringStreamCount,
      recurringChangeCount,
      spendingRegimeCount,
      highestPriorityScore,
      oldestActiveDate
    };
  }

  async findById(userId: string, id: string): Promise<ReviewItem | null> {
    const rows = await this.db
      .select()
      .from(reviewInboxItems)
      .where(and(eq(reviewInboxItems.userId, userId), eq(reviewInboxItems.id, id)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return this.mapRowToReviewItem(row);
  }

  async dismissInTx(
    userId: string,
    id: string,
    reason: ReviewItemDismissReason,
    tx: DrizzleDb
  ): Promise<ReviewItem> {
    const existing = await tx
      .select()
      .from(reviewInboxItems)
      .where(and(eq(reviewInboxItems.userId, userId), eq(reviewInboxItems.id, id)))
      .limit(1);

    const item = existing[0];
    if (!item) {
      throw new EntityNotFoundError("ReviewItem");
    }

    if (item.status === "dismissed") {
      return this.mapRowToReviewItem(item);
    }

    const now = new Date();
    const updated = await tx
      .update(reviewInboxItems)
      .set({
        status: "dismissed",
        dismissedAt: now,
        dismissReason: reason,
        updatedAt: now
      })
      .where(and(eq(reviewInboxItems.userId, userId), eq(reviewInboxItems.id, id)))
      .returning();

    const result = updated[0];
    if (!result) throw new EntityNotFoundError("ReviewItem");
    return this.mapRowToReviewItem(result);
  }

  async submitFeedbackInTx(
    userId: string,
    id: string,
    action: ReviewItemFeedbackAction,
    tx: DrizzleDb
  ): Promise<ReviewItem> {
    const existing = await tx
      .select()
      .from(reviewInboxItems)
      .where(and(eq(reviewInboxItems.userId, userId), eq(reviewInboxItems.id, id)))
      .limit(1);

    const item = existing[0];
    if (!item) {
      throw new EntityNotFoundError("ReviewItem");
    }

    if (item.status === "resolved") {
      return this.mapRowToReviewItem(item);
    }

    const now = new Date();
    const updated = await tx
      .update(reviewInboxItems)
      .set({
        status: "resolved",
        resolvedAt: now,
        feedbackAction: action,
        updatedAt: now
      })
      .where(and(eq(reviewInboxItems.userId, userId), eq(reviewInboxItems.id, id)))
      .returning();

    const result = updated[0];
    if (!result) throw new EntityNotFoundError("ReviewItem");
    return this.mapRowToReviewItem(result);
  }

  /**
   * Discovers candidate review items from:
   * 1. Candidate detected recurring streams
   * 2. Detected recurring stream changes
   * 3. Detected variable spending regimes
   * 4. Uncategorized transactions with suggestions
   */
  async discoverSourceItems(userId: string, asOf: Date): Promise<CandidateSourceItem[]> {
    const lookbackStart = new Date(asOf.getTime() - 90 * 86_400_000); // 90-day active review window

    const [streams, changes, regimes, uncategorizedTxns] = await Promise.all([
      this.db
        .select()
        .from(detectedRecurringStreams)
        .where(
          and(
            eq(detectedRecurringStreams.userId, userId),
            eq(detectedRecurringStreams.state, "candidate"),
            gte(detectedRecurringStreams.computedAt, lookbackStart)
          )
        ),
      this.db
        .select()
        .from(detectedRecurringStreamChanges)
        .where(
          and(
            eq(detectedRecurringStreamChanges.userId, userId),
            gte(detectedRecurringStreamChanges.computedAt, lookbackStart)
          )
        ),
      this.db
        .select()
        .from(spendingRegimes)
        .where(
          and(eq(spendingRegimes.userId, userId), gte(spendingRegimes.computedAt, lookbackStart))
        ),
      this.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.status, "posted"),
            sql`${transactions.categoryId} IS NULL`,
            gte(transactions.occurredAt, lookbackStart)
          )
        )
        .limit(100)
    ]);

    const candidates: CandidateSourceItem[] = [];

    // 1. Candidate recurring streams
    for (const s of streams) {
      candidates.push({
        sourceType: "recurring_stream",
        sourceId: s.id,
        sourceVersion: s.detectorVersion,
        confidenceBps: s.confidenceBps,
        amountMinor: s.medianAmountMinor,
        title: `Candidate ${s.cadence} Recurring Commitment`,
        subtitle: `Estimated ~₹${Math.round(s.medianAmountMinor / 100)} ${s.cadence}`,
        evidence: toRecord(s.evidence),
        inputWatermark: toRecord(s.inputWatermark),
        occurredAt: s.computedAt
      });
    }

    // 2. Detected recurring stream changes
    for (const c of changes) {
      const dir = c.direction === "increase" ? "Increase" : "Reduction";
      candidates.push({
        sourceType: "recurring_change",
        sourceId: c.id,
        sourceVersion: c.detectorVersion,
        confidenceBps: c.confidenceBps,
        amountMinor: c.newMedianMinor,
        title: `Recurring Cost ${dir}`,
        subtitle: `Median shifted from ₹${Math.round(c.oldMedianMinor / 100)} to ₹${Math.round(c.newMedianMinor / 100)}`,
        evidence: toRecord(c.evidence),
        inputWatermark: toRecord(c.inputWatermark),
        occurredAt: c.changeOccurredAt
      });
    }

    // 3. Spending Regimes
    for (const r of regimes) {
      const dir = r.direction === "increase" ? "Upward Shift" : "Downward Shift";
      candidates.push({
        sourceType: "spending_regime",
        sourceId: r.id,
        sourceVersion: r.detectorVersion,
        confidenceBps: r.confidenceBps,
        amountMinor: r.newMedianMinor,
        title: `Discretionary Spending ${dir}`,
        subtitle: `Weekly median changed from ₹${Math.round(r.baselineMedianMinor / 100)} to ₹${Math.round(r.newMedianMinor / 100)}`,
        evidence: toRecord(r.evidence),
        inputWatermark: toRecord(r.inputWatermark),
        occurredAt: r.computedAt
      });
    }

    // 4. Uncategorized transactions
    for (const t of uncategorizedTxns) {
      candidates.push({
        sourceType: "category_suggestion",
        sourceId: t.id,
        sourceVersion: 1,
        confidenceBps: 5_000,
        amountMinor: t.amountMinor,
        title: "Uncategorized Transaction",
        subtitle: `Transaction of ₹${Math.round(t.amountMinor / 100)} needs category assignment`,
        evidence: { transactionId: t.id, type: t.type },
        inputWatermark: { asOf: asOf.toISOString(), transactionId: t.id },
        occurredAt: t.occurredAt
      });
    }

    return candidates;
  }

  /**
   * Ingests, prioritizes, deduplicates, and supersedes review items.
   */
  async syncUserInbox(userId: string, asOf: Date): Promise<number> {
    const candidates = await this.discoverSourceItems(userId, asOf);
    if (candidates.length === 0) return 0;

    let insertedCount = 0;

    await withTxn(this.db, async (tx) => {
      for (const cand of candidates) {
        const priorityFactors = calculateReviewPriority({
          sourceType: cand.sourceType,
          confidenceBps: cand.confidenceBps,
          amountMinor: cand.amountMinor,
          occurredAt: cand.occurredAt,
          asOf,
          customReason: cand.customReason
        });

        // 1. Check if an item for this (userId, sourceType, sourceId, sourceVersion) already exists
        const existing = await tx
          .select()
          .from(reviewInboxItems)
          .where(
            and(
              eq(reviewInboxItems.userId, userId),
              eq(reviewInboxItems.sourceType, cand.sourceType),
              eq(reviewInboxItems.sourceId, cand.sourceId),
              eq(reviewInboxItems.sourceVersion, cand.sourceVersion)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          continue; // Deduplicated: already exists
        }

        // 2. Check if an older active item exists for the same (userId, sourceType, sourceId)
        const olderActive = await tx
          .select()
          .from(reviewInboxItems)
          .where(
            and(
              eq(reviewInboxItems.userId, userId),
              eq(reviewInboxItems.sourceType, cand.sourceType),
              eq(reviewInboxItems.sourceId, cand.sourceId),
              eq(reviewInboxItems.status, "active")
            )
          )
          .limit(1);

        const newItemId = crypto.randomUUID();
        const supersedesItemId = olderActive[0]?.id ?? null;
        const now = new Date();

        // 3. Mark older item as superseded if present
        if (supersedesItemId) {
          await tx
            .update(reviewInboxItems)
            .set({
              status: "superseded",
              updatedAt: now
            })
            .where(eq(reviewInboxItems.id, supersedesItemId));
        }

        // 4. Insert new review item
        await tx.insert(reviewInboxItems).values({
          id: newItemId,
          userId,
          sourceType: cand.sourceType,
          sourceId: cand.sourceId,
          sourceVersion: cand.sourceVersion,
          status: "active",
          priorityScore: priorityFactors.compositeScore,
          priorityFactors,
          title: cand.title,
          subtitle: cand.subtitle,
          amountMinor: cand.amountMinor,
          confidenceBps: cand.confidenceBps,
          evidence: cand.evidence,
          inputWatermark: cand.inputWatermark,
          supersedesItemId,
          occurredAt: cand.occurredAt,
          dismissedAt: null,
          dismissReason: null,
          resolvedAt: null,
          feedbackAction: null,
          createdAt: now,
          updatedAt: now
        });

        insertedCount += 1;
      }
    });

    return insertedCount;
  }

  private mapRowToReviewItem(row: typeof reviewInboxItems.$inferSelect): ReviewItem {
    return ReviewItemSchema.parse({
      id: row.id,
      userId: row.userId,
      sourceType: ReviewItemSourceTypeSchema.parse(row.sourceType),
      sourceId: row.sourceId,
      sourceVersion: row.sourceVersion,
      status: ReviewItemStatusSchema.parse(row.status),
      priorityScore: row.priorityScore,
      priorityFactors: ReviewItemPriorityFactorsSchema.parse(row.priorityFactors),
      title: row.title,
      subtitle: row.subtitle,
      amountMinor: row.amountMinor,
      confidenceBps: row.confidenceBps,
      evidence: toRecord(row.evidence),
      inputWatermark: toRecord(row.inputWatermark),
      supersedesItemId: row.supersedesItemId,
      occurredAt: row.occurredAt,
      dismissedAt: row.dismissedAt,
      dismissReason: row.dismissReason
        ? ReviewItemDismissReasonSchema.parse(row.dismissReason)
        : null,
      resolvedAt: row.resolvedAt,
      feedbackAction: row.feedbackAction
        ? ReviewItemFeedbackActionSchema.parse(row.feedbackAction)
        : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    });
  }
}
