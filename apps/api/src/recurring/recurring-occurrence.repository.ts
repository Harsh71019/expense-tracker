import { Inject, Injectable } from "@nestjs/common";
import {
  RecurringOccurrenceSchema,
  type ListRecurringOccurrencesQuery,
  type RecurringOccurrence,
  type RecurringOccurrenceId,
  type RecurringOccurrencePage,
  type RecurringRuleId
} from "@treasury-ops/shared";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { recurringOccurrences, recurringRules } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";
import { InvalidCursorError } from "../common/errors/invalid-cursor.error.js";
import type { RecurringCandidate } from "./recurring-reconciliation-matcher.js";

const OccurrenceCursorSchema = z.object({
  occurredAt: z.string().datetime(),
  id: z.string().uuid()
});

/**
 * `missed` is never stored (see the schema table's own comment) — a
 * still-`expected` occurrence more than this many days past its
 * `occurredAt` is presented as `missed` at read time. Purely informational:
 * it doesn't block linking a transaction to it later.
 */
const MISSED_GRACE_DAYS = 7;

@Injectable()
export class RecurringOccurrenceRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async createExpected(
    userId: string,
    recurringRuleId: RecurringRuleId,
    occurredAt: Date,
    tx: DbTx
  ): Promise<RecurringOccurrence> {
    const now = new Date();
    const [row] = await tx
      .insert(recurringOccurrences)
      .values({
        userId,
        recurringRuleId,
        occurredAt,
        status: "expected",
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Recurring occurrence insert did not return a row.");
    return toOccurrence(row);
  }

  async findById(
    userId: string,
    occurrenceId: RecurringOccurrenceId,
    tx?: DbTx
  ): Promise<RecurringOccurrence | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(recurringOccurrences)
      .where(
        and(eq(recurringOccurrences.id, occurrenceId), eq(recurringOccurrences.userId, userId))
      );
    return row === undefined ? null : toOccurrence(row);
  }

  async findByIdForUpdate(
    userId: string,
    occurrenceId: RecurringOccurrenceId,
    tx: DbTx
  ): Promise<RecurringOccurrence | null> {
    const [row] = await tx
      .select()
      .from(recurringOccurrences)
      .where(
        and(eq(recurringOccurrences.id, occurrenceId), eq(recurringOccurrences.userId, userId))
      )
      .for("update");
    return row === undefined ? null : toOccurrence(row);
  }

  async confirm(
    userId: string,
    occurrenceId: RecurringOccurrenceId,
    confirmedTransactionId: string,
    tx: DbTx
  ): Promise<RecurringOccurrence | null> {
    const [row] = await tx
      .update(recurringOccurrences)
      .set({ status: "confirmed", confirmedTransactionId, updatedAt: new Date() })
      .where(
        and(
          eq(recurringOccurrences.id, occurrenceId),
          eq(recurringOccurrences.userId, userId),
          eq(recurringOccurrences.status, "expected")
        )
      )
      .returning();
    return row === undefined ? null : toOccurrence(row);
  }

  async findMany(
    userId: string,
    recurringRuleId: RecurringRuleId,
    query: ListRecurringOccurrencesQuery
  ): Promise<RecurringOccurrencePage> {
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const conditions = [
      eq(recurringOccurrences.userId, userId),
      eq(recurringOccurrences.recurringRuleId, recurringRuleId)
    ];
    if (cursor !== null) {
      conditions.push(
        sql`(${recurringOccurrences.occurredAt}, ${recurringOccurrences.id}) < (${cursor.occurredAt}, ${cursor.id})`
      );
    }

    const rows = await this.db
      .select()
      .from(recurringOccurrences)
      .where(and(...conditions))
      .orderBy(desc(recurringOccurrences.occurredAt), desc(recurringOccurrences.id))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit).map(toOccurrence);
    const last = page.at(-1);
    return {
      items: page,
      pageInfo: {
        nextCursor: hasMore && last !== undefined ? encodeCursor(last.occurredAt, last.id) : null,
        hasMore,
        limit: query.limit
      }
    };
  }

  /**
   * Cross-rule feed for the transaction-detail "link this as a recurring
   * payment" picker (mirrors useOpenBills' bounded flat list): every
   * still-`expected`/`missed` occurrence across all of the user's manual-post
   * rules, oldest due first. Personal-finance scale, so a flat capped list
   * rather than cursor pagination.
   */
  async findOutstandingForUser(userId: string, limit: number): Promise<RecurringOccurrence[]> {
    const rows = await this.db
      .select()
      .from(recurringOccurrences)
      .where(
        and(eq(recurringOccurrences.userId, userId), eq(recurringOccurrences.status, "expected"))
      )
      .orderBy(recurringOccurrences.occurredAt)
      .limit(limit);
    return rows.map(toOccurrence);
  }

  /**
   * Candidates for the auto-match step RecurringReconciliationService runs
   * against every newly created transaction: this account/type's still-
   * `expected` occurrences within `windowDays` of `occurredAt`, shaped as
   * RecurringCandidate so matchIncomingTransaction (built for the placeholder-
   * transaction reconciliation path) can be reused as-is. `transactionId`
   * here deliberately holds the *occurrence* id, not a transaction id — the
   * caller (RecurringReconciliationService) knows which candidate set it
   * queried and interprets the match result's id accordingly; the matcher
   * itself only ever treats it as an opaque identifier to return.
   */
  async findPendingCandidatesForMatching(
    userId: string,
    accountId: string,
    occurredAt: Date,
    windowDays: number,
    tx?: DbTx
  ): Promise<RecurringCandidate[]> {
    const executor = tx ?? this.db;
    const windowMs = windowDays * 24 * 60 * 60 * 1_000;
    const rows = await executor
      .select({
        id: recurringOccurrences.id,
        recurringRuleId: recurringOccurrences.recurringRuleId,
        occurredAt: recurringOccurrences.occurredAt,
        templateAccountId: recurringRules.templateAccountId,
        templateType: recurringRules.templateType,
        templateAmountMinor: recurringRules.templateAmountMinor,
        templateDescription: recurringRules.templateDescription
      })
      .from(recurringOccurrences)
      .innerJoin(recurringRules, eq(recurringRules.id, recurringOccurrences.recurringRuleId))
      .where(
        and(
          eq(recurringOccurrences.userId, userId),
          eq(recurringOccurrences.status, "expected"),
          eq(recurringRules.templateAccountId, accountId),
          gte(recurringOccurrences.occurredAt, new Date(occurredAt.getTime() - windowMs)),
          lte(recurringOccurrences.occurredAt, new Date(occurredAt.getTime() + windowMs))
        )
      );

    return rows.map((row) => ({
      transactionId: row.id,
      ruleId: row.recurringRuleId,
      accountId: row.templateAccountId,
      type: row.templateType,
      amountMinor: row.templateAmountMinor,
      occurredAt: row.occurredAt,
      templateDescription: row.templateDescription
    }));
  }
}

function toOccurrence(row: typeof recurringOccurrences.$inferSelect): RecurringOccurrence {
  const stripped = stripNulls(row);
  return RecurringOccurrenceSchema.parse({
    id: row.id,
    userId: row.userId,
    recurringRuleId: row.recurringRuleId,
    occurredAt: row.occurredAt,
    status: deriveStatus(row.status, row.occurredAt),
    confirmedTransactionId: stripped.confirmedTransactionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function deriveStatus(
  status: "expected" | "confirmed",
  occurredAt: Date
): RecurringOccurrence["status"] {
  if (status !== "expected") return status;
  const graceMs = MISSED_GRACE_DAYS * 24 * 60 * 60 * 1_000;
  return Date.now() - occurredAt.getTime() > graceMs ? "missed" : "expected";
}

function encodeCursor(occurredAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ occurredAt: occurredAt.toISOString(), id }), "utf8").toString(
    "base64url"
  );
}

function decodeCursor(cursor: string): z.infer<typeof OccurrenceCursorSchema> {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return OccurrenceCursorSchema.parse(parsed);
  } catch {
    throw new InvalidCursorError();
  }
}
