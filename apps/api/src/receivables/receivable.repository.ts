import { Inject, Injectable } from "@nestjs/common";
import {
  ReceivableEventSchema,
  StoredReceivableSchema,
  type CreateReceivable,
  type ListReceivableEventsQuery,
  type ListReceivablesQuery,
  type ReceivableEvent,
  type ReceivableEventKind,
  type ReceivableId,
  type StoredReceivable,
  type UpdateReceivableMetadata
} from "@treasury-ops/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { receivableEvents, receivables, transactions } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import { InvalidCursorError } from "../common/errors/invalid-cursor.error.js";

export type ReceivableSummary = Readonly<{
  totalOutstandingMinor: number;
  totalConfirmedRepaidMinor: number;
  activeCount: number;
  dueCount: number;
}>;

export type ReceivableBalance = Readonly<{
  outstandingMinor: number;
  confirmedRepaidMinor: number;
  repaymentCount: number;
  hasEffectiveOpening: boolean;
  hasAnyOpeningEver: boolean;
}>;

export type ReceivableWithBalance = StoredReceivable & ReceivableBalance;

export type ReceivablePageResult = Readonly<{
  items: readonly ReceivableWithBalance[];
  nextCursor: string | null;
  hasMore: boolean;
}>;

export type ReceivableEventPageResult = Readonly<{
  items: readonly ReceivableEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}>;

export type NewReceivableEvent = Readonly<{
  kind: ReceivableEventKind;
  amountMinor: number;
  occurredAt: Date;
  transactionId?: string | undefined;
  legacyValuationId?: string | undefined;
  reason?: string | undefined;
}>;

const CursorPayloadSchema = z.object({
  sortKey: z.string().datetime(),
  id: z.string().uuid()
});

// `receivableEvents` linked to a still-posted (never reversed) transaction, or
// carrying no transaction link at all, currently contribute to the balance --
// plan doc §8. This mirrors the historical-as-of rule but only for "now".
const EVENT_EFFECTIVE = sql`(${receivableEvents.transactionId} IS NULL OR ${transactions.status} <> 'reversed')`;
const INCREASE_KINDS = sql`${receivableEvents.kind} IN ('opening', 'correction_increase', 'legacy_increase')`;
const DECREASE_KINDS = sql`${receivableEvents.kind} IN ('repayment', 'correction_decrease', 'legacy_decrease')`;

const OUTSTANDING_EXPR = sql<string>`coalesce(sum(case
  when ${EVENT_EFFECTIVE} and ${INCREASE_KINDS} then ${receivableEvents.amountMinor}
  when ${EVENT_EFFECTIVE} and ${DECREASE_KINDS} then -${receivableEvents.amountMinor}
  else 0 end), 0)::bigint`;

// Confirmed repayments only -- a migrated legacy valuation decrease is never
// labeled a confirmed repayment (plan doc §9, §15).
const CONFIRMED_REPAID_EXPR = sql<string>`coalesce(sum(case
  when ${EVENT_EFFECTIVE} and ${receivableEvents.kind} = 'repayment' then ${receivableEvents.amountMinor}
  else 0 end), 0)::bigint`;

const REPAYMENT_COUNT_EXPR = sql<string>`count(case
  when ${EVENT_EFFECTIVE} and ${receivableEvents.kind} = 'repayment' then 1 end)`;

// > 0 in JS distinguishes "settled" (an opening was, and remains, effective)
// from "cancelled" (the opening itself was reversed) once outstanding is 0 --
// plan doc invariant 12.
const HAS_OPENING_EXPR = sql<string>`coalesce(sum(case
  when ${EVENT_EFFECTIVE} and ${INCREASE_KINDS} then ${receivableEvents.amountMinor}
  else 0 end), 0)::bigint`;

// Unlike HAS_OPENING_EXPR, ignores EVENT_EFFECTIVE: true if an opening-kind
// event was EVER written, effective or not. A migrated legacy asset whose
// every historical valuation was exactly zero gets zero receivable_events at
// all (the backfill skips zero deltas), so it has no opening ever -- distinct
// from a receivable whose cash-backed opening was later reversed, which did
// have one. `deriveReceivableStatus` needs both signals to tell "settled,
// nothing was ever owed" apart from "cancelled, the lend itself was undone".
const HAS_ANY_OPENING_EVER_EXPR = sql<string>`coalesce(sum(case
  when ${INCREASE_KINDS} then ${receivableEvents.amountMinor}
  else 0 end), 0)::bigint`;

@Injectable()
export class ReceivableRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    input: CreateReceivable,
    tx: DbTx,
    legacyAssetId?: string
  ): Promise<StoredReceivable> {
    const now = new Date();
    const [row] = await tx
      .insert(receivables)
      .values({
        userId,
        counterpartyName: input.counterpartyName,
        note: input.note ?? null,
        openedAt: input.openedAt,
        dueAt: input.dueAt ?? null,
        legacyAssetId: legacyAssetId ?? null,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Receivable insert did not return a row.");
    return toStoredReceivable(row);
  }

  /** Used by the staged `POST /assets` compatibility adapter (plan doc
   * §13.3) to detect a legacy `loan_receivable` asset that already moved to
   * the receivables sub-ledger, so valuation/close can reject with
   * `AssetMovedToReceivablesError` instead of operating on stale data. */
  async findByLegacyAssetId(
    userId: string,
    legacyAssetId: string,
    tx?: DbTx
  ): Promise<StoredReceivable | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(receivables)
      .where(and(eq(receivables.userId, userId), eq(receivables.legacyAssetId, legacyAssetId)));
    return row === undefined ? null : toStoredReceivable(row);
  }

  async updateMetadata(
    userId: string,
    receivableId: ReceivableId,
    patch: UpdateReceivableMetadata,
    tx: DbTx
  ): Promise<StoredReceivable | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.counterpartyName !== undefined) set.counterpartyName = patch.counterpartyName;
    if (patch.note !== undefined) set.note = patch.note;
    if (patch.dueAt !== undefined) set.dueAt = patch.dueAt;

    const [row] = await tx
      .update(receivables)
      .set(set)
      .where(and(eq(receivables.id, receivableId), eq(receivables.userId, userId)))
      .returning();
    return row === undefined ? null : toStoredReceivable(row);
  }

  async findById(
    userId: string,
    receivableId: ReceivableId,
    tx?: DbTx
  ): Promise<StoredReceivable | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(receivables)
      .where(and(eq(receivables.id, receivableId), eq(receivables.userId, userId)));
    return row === undefined ? null : toStoredReceivable(row);
  }

  /** Row-locks the receivable for the duration of `tx` -- callers must hold
   * `tx` for the whole read-recompute-write sequence (plan doc §10.3/§10.5). */
  async findByIdForUpdate(
    userId: string,
    receivableId: ReceivableId,
    tx: DbTx
  ): Promise<StoredReceivable | null> {
    const [row] = await tx
      .select()
      .from(receivables)
      .where(and(eq(receivables.id, receivableId), eq(receivables.userId, userId)))
      .for("update");
    return row === undefined ? null : toStoredReceivable(row);
  }

  async getBalance(
    userId: string,
    receivableId: ReceivableId,
    tx?: DbTx
  ): Promise<ReceivableBalance> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select({
        outstandingMinor: OUTSTANDING_EXPR,
        confirmedRepaidMinor: CONFIRMED_REPAID_EXPR,
        repaymentCount: REPAYMENT_COUNT_EXPR,
        hasOpening: HAS_OPENING_EXPR,
        hasAnyOpeningEver: HAS_ANY_OPENING_EVER_EXPR
      })
      .from(receivableEvents)
      .leftJoin(transactions, eq(receivableEvents.transactionId, transactions.id))
      .where(
        and(eq(receivableEvents.userId, userId), eq(receivableEvents.receivableId, receivableId))
      );
    if (row === undefined) throw new Error("Receivable balance aggregate did not return a row.");
    return toBalance(row);
  }

  /** Global totals across every one of this user's receivables, not just
   * the current page -- the Debt Given summary cards must reflect the same
   * totals regardless of which page/filter is currently loaded. */
  async getSummary(userId: string): Promise<ReceivableSummary> {
    const perReceivable = this.db
      .select({
        id: receivables.id,
        dueAt: receivables.dueAt,
        outstandingMinor: OUTSTANDING_EXPR.as("outstanding_minor"),
        confirmedRepaidMinor: CONFIRMED_REPAID_EXPR.as("confirmed_repaid_minor")
      })
      .from(receivables)
      .leftJoin(receivableEvents, eq(receivableEvents.receivableId, receivables.id))
      .leftJoin(transactions, eq(receivableEvents.transactionId, transactions.id))
      .where(eq(receivables.userId, userId))
      .groupBy(receivables.id)
      .as("per_receivable");

    const now = new Date();
    const [row] = await this.db
      .select({
        totalOutstandingMinor: sql<string>`coalesce(sum(${perReceivable.outstandingMinor}), 0)::bigint`,
        totalConfirmedRepaidMinor: sql<string>`coalesce(sum(${perReceivable.confirmedRepaidMinor}), 0)::bigint`,
        activeCount: sql<string>`count(*) filter (where ${perReceivable.outstandingMinor} > 0)::bigint`,
        dueCount: sql<string>`count(*) filter (
          where ${perReceivable.outstandingMinor} > 0
          and ${perReceivable.dueAt} is not null
          and ${perReceivable.dueAt} < ${now}
        )::bigint`
      })
      .from(perReceivable);
    if (row === undefined) throw new Error("Receivable summary aggregate did not return a row.");
    return {
      totalOutstandingMinor: Number(row.totalOutstandingMinor),
      totalConfirmedRepaidMinor: Number(row.totalConfirmedRepaidMinor),
      activeCount: Number(row.activeCount),
      dueCount: Number(row.dueCount)
    };
  }

  async list(
    userId: string,
    query: ListReceivablesQuery,
    tx?: DbTx
  ): Promise<ReceivablePageResult> {
    const executor = tx ?? this.db;
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);

    const conditions = [eq(receivables.userId, userId)];
    if (cursor !== null) {
      conditions.push(
        sql`(${receivables.createdAt}, ${receivables.id}) < (${cursor.sortKey}, ${cursor.id})`
      );
    }

    const statusHaving = havingForStatus(query.status);

    const rows = await executor
      .select({
        receivable: receivables,
        outstandingMinor: OUTSTANDING_EXPR,
        confirmedRepaidMinor: CONFIRMED_REPAID_EXPR,
        repaymentCount: REPAYMENT_COUNT_EXPR,
        hasOpening: HAS_OPENING_EXPR,
        hasAnyOpeningEver: HAS_ANY_OPENING_EVER_EXPR
      })
      .from(receivables)
      .leftJoin(receivableEvents, eq(receivableEvents.receivableId, receivables.id))
      .leftJoin(transactions, eq(receivableEvents.transactionId, transactions.id))
      .where(and(...conditions))
      .groupBy(receivables.id)
      .having(statusHaving)
      .orderBy(desc(receivables.createdAt), desc(receivables.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const items = page.map((row) => ({
      ...toStoredReceivable(row.receivable),
      ...toBalance(row)
    }));
    const last = items.at(-1);
    const hasMore = rows.length > query.limit;
    const nextCursor = hasMore && last !== undefined ? encodeCursor(last.createdAt, last.id) : null;

    return { items, nextCursor, hasMore };
  }

  async insertEvent(
    userId: string,
    receivableId: ReceivableId,
    event: NewReceivableEvent,
    tx: DbTx
  ): Promise<ReceivableEvent> {
    const [row] = await tx
      .insert(receivableEvents)
      .values({
        userId,
        receivableId,
        kind: event.kind,
        amountMinor: event.amountMinor,
        occurredAt: event.occurredAt,
        transactionId: event.transactionId ?? null,
        legacyValuationId: event.legacyValuationId ?? null,
        reason: event.reason ?? null,
        createdAt: new Date()
      })
      .returning();
    if (row === undefined) throw new Error("Receivable event insert did not return a row.");
    return toReceivableEvent(row, false);
  }

  async listEvents(
    userId: string,
    receivableId: ReceivableId,
    query: ListReceivableEventsQuery,
    tx?: DbTx
  ): Promise<ReceivableEventPageResult> {
    const executor = tx ?? this.db;
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);

    const conditions = [
      eq(receivableEvents.userId, userId),
      eq(receivableEvents.receivableId, receivableId)
    ];
    if (cursor !== null) {
      conditions.push(
        sql`(${receivableEvents.occurredAt}, ${receivableEvents.id}) < (${cursor.sortKey}, ${cursor.id})`
      );
    }

    const rows = await executor
      .select({ event: receivableEvents, transactionStatus: transactions.status })
      .from(receivableEvents)
      .leftJoin(transactions, eq(receivableEvents.transactionId, transactions.id))
      .where(and(...conditions))
      .orderBy(desc(receivableEvents.occurredAt), desc(receivableEvents.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const items = page.map((row) =>
      toReceivableEvent(row.event, row.transactionStatus === "reversed")
    );
    const last = items.at(-1);
    const hasMore = rows.length > query.limit;
    const nextCursor =
      hasMore && last !== undefined ? encodeCursor(last.occurredAt, last.id) : null;

    return { items, nextCursor, hasMore };
  }

  /** Every currently-active (outstanding > 0) receivable's id/name/balance,
   * for the NetWorth read side (plan doc §12) -- unpaginated since a
   * personal-finance user's active-receivable count is small. */
  async listActiveForNetWorth(
    userId: string,
    tx?: DbTx
  ): Promise<
    readonly { receivableId: string; counterpartyName: string; outstandingMinor: number }[]
  > {
    const executor = tx ?? this.db;
    const rows = await executor
      .select({
        receivableId: receivables.id,
        counterpartyName: receivables.counterpartyName,
        outstandingMinor: OUTSTANDING_EXPR
      })
      .from(receivables)
      .leftJoin(receivableEvents, eq(receivableEvents.receivableId, receivables.id))
      .leftJoin(transactions, eq(receivableEvents.transactionId, transactions.id))
      .where(eq(receivables.userId, userId))
      .groupBy(receivables.id)
      .having(sql`${OUTSTANDING_EXPR} > 0`);

    return rows.map((row) => ({
      receivableId: row.receivableId,
      counterpartyName: row.counterpartyName,
      outstandingMinor: Number(row.outstandingMinor)
    }));
  }

  /** Used to enforce "a candidate transaction has no existing receivable
   * link" (plan doc §10.4 step 3) ahead of the unique-index guard. */
  async findEventByTransactionId(
    userId: string,
    transactionId: string,
    tx?: DbTx
  ): Promise<ReceivableEvent | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(receivableEvents)
      .where(
        and(eq(receivableEvents.userId, userId), eq(receivableEvents.transactionId, transactionId))
      );
    return row === undefined ? null : toReceivableEvent(row, false);
  }
}

function toStoredReceivable(row: typeof receivables.$inferSelect): StoredReceivable {
  return StoredReceivableSchema.parse(stripNulls(row));
}

function toBalance(row: {
  outstandingMinor: string;
  confirmedRepaidMinor: string;
  repaymentCount: string;
  hasOpening: string;
  hasAnyOpeningEver: string;
}): ReceivableBalance {
  return {
    outstandingMinor: Number(row.outstandingMinor),
    confirmedRepaidMinor: Number(row.confirmedRepaidMinor),
    repaymentCount: Number(row.repaymentCount),
    hasEffectiveOpening: Number(row.hasOpening) > 0,
    hasAnyOpeningEver: Number(row.hasAnyOpeningEver) > 0
  };
}

function toReceivableEvent(
  row: typeof receivableEvents.$inferSelect,
  isReversed: boolean
): ReceivableEvent {
  return ReceivableEventSchema.parse({ ...stripNulls(row), isReversed });
}

// Mirrors deriveReceivableStatus (receivable-policy.ts): "cancelled" requires
// an opening to have existed and no longer be effective (it was reversed);
// "settled" is everything else at zero outstanding, including a receivable
// that never had an opening event at all (e.g. a zero-valued migrated asset).
function havingForStatus(status: ListReceivablesQuery["status"]) {
  switch (status) {
    case "active":
      return sql`${OUTSTANDING_EXPR} > 0`;
    case "cancelled":
      return sql`${OUTSTANDING_EXPR} = 0 and ${HAS_ANY_OPENING_EVER_EXPR} > 0 and ${HAS_OPENING_EXPR} = 0`;
    case "settled":
      return sql`${OUTSTANDING_EXPR} = 0 and not (${HAS_ANY_OPENING_EVER_EXPR} > 0 and ${HAS_OPENING_EXPR} = 0)`;
    case "all":
      return sql`true`;
  }
}

function encodeCursor(sortKey: Date, id: string): string {
  return Buffer.from(JSON.stringify({ sortKey: sortKey.toISOString(), id }), "utf8").toString(
    "base64url"
  );
}

function decodeCursor(cursor: string): { sortKey: Date; id: string } {
  try {
    const payload = CursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    );
    return { sortKey: new Date(payload.sortKey), id: payload.id };
  } catch {
    throw new InvalidCursorError();
  }
}
