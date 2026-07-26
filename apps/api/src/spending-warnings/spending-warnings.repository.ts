import { Inject, Injectable } from "@nestjs/common";
import {
  SpendingWarningEligibleKindsSchema,
  SpendingWarningSchema,
  type ListSpendingWarningsQuery,
  type PageInfo,
  type SpendingWarning,
  type SpendingWarningEvidence,
  type SpendingWarningKind,
  type SpendingWarningSeverity
} from "@treasury-ops/shared";
import { and, eq, gte, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { InvalidCursorError } from "../common/errors/invalid-cursor.error.js";
import {
  categories,
  spendingWarningAnalysisState,
  spendingWarnings,
  transactions
} from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type {
  CandidateExpenseRow,
  CategoryWindowSum,
  WindowSum
} from "./spending-warnings.detector.js";

const CursorPayloadSchema = z.object({
  lastDetectedAt: z.string().datetime(),
  id: z.string().uuid()
});

export type AnalysisStateRow = Readonly<{
  detectorVersion: number;
  status: "learning" | "ready";
  computedAt: Date;
  sourceThrough: Date;
  historyStart: Date | null;
  baselineExpenseCount: number;
  eligibleKinds: SpendingWarningKind[];
}>;

export type SpendingWarningUpsertInput = Readonly<{
  fingerprint: string;
  kind: SpendingWarningKind;
  severity: SpendingWarningSeverity;
  categoryId: string | null;
  transactionId: string | null;
  windowStart: Date;
  windowEnd: Date;
  evidence: SpendingWarningEvidence;
  detectorVersion: number;
}>;

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const OVERALL_LOOKBACK_DAYS = 63; // 7 * (1 current + 8 baseline)
const CATEGORY_LOOKBACK_DAYS = 210; // 30 * (1 current + 6 baseline)
const LARGE_EXPENSE_LOOKBACK_DAYS = 210; // 30 candidate + 180 baseline

@Injectable()
export class SpendingWarningsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  /**
   * 9 grouped-sum rows (windowIndex 0 = current 7-day window, 1..8 =
   * baseline windows, most-recent-first) — one bounded, indexed SQL scan,
   * never a hydrated transaction history (plan §8).
   */
  async overallWindowSums(userId: string, analysisBoundary: Date): Promise<WindowSum[]> {
    const rangeStart = new Date(analysisBoundary.getTime() - OVERALL_LOOKBACK_DAYS * 86_400_000);
    const windowIndexExpr = sql<number>`floor(extract(epoch from (${analysisBoundary}::timestamptz - ${transactions.occurredAt})) / ${SEVEN_DAYS_SECONDS})::int`;
    const rows = await this.db
      .select({
        windowIndex: windowIndexExpr,
        totalMinor: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)::bigint`,
        expenseCount: sql<number>`count(*)::int`
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          eq(transactions.type, "expense"),
          isNull(transactions.transferGroupId),
          gte(transactions.occurredAt, rangeStart),
          lt(transactions.occurredAt, analysisBoundary)
        )
      )
      // Ordinal position, not the `windowIndexExpr` object again: re-embedding
      // the same `sql` template a second time gives it a *new* set of bound
      // parameters (a fresh $n for `analysisBoundary`), which Postgres then
      // treats as a syntactically different expression from the one in the
      // SELECT list -- "column must appear in GROUP BY" even though the two
      // are logically identical. `GROUP BY 1` refers back to the first
      // SELECT output column instead, sidestepping the reparameterization.
      .groupBy(sql`1`);
    return rows.map((row) => ({
      windowIndex: row.windowIndex,
      totalMinor: Number(row.totalMinor),
      expenseCount: row.expenseCount
    }));
  }

  /** Same shape as {@link overallWindowSums}, grouped by 30-day windows and categoryId (null = Uncategorized). */
  async categoryWindowSums(userId: string, analysisBoundary: Date): Promise<CategoryWindowSum[]> {
    const rangeStart = new Date(analysisBoundary.getTime() - CATEGORY_LOOKBACK_DAYS * 86_400_000);
    const windowIndexExpr = sql<number>`floor(extract(epoch from (${analysisBoundary}::timestamptz - ${transactions.occurredAt})) / ${THIRTY_DAYS_SECONDS})::int`;
    const rows = await this.db
      .select({
        categoryId: transactions.categoryId,
        windowIndex: windowIndexExpr,
        totalMinor: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)::bigint`,
        expenseCount: sql<number>`count(*)::int`
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          eq(transactions.type, "expense"),
          isNull(transactions.transferGroupId),
          gte(transactions.occurredAt, rangeStart),
          lt(transactions.occurredAt, analysisBoundary)
        )
      )
      // Ordinal position for the same reason as overallWindowSums above.
      .groupBy(transactions.categoryId, sql`2`);
    return rows.map((row) => ({
      categoryId: row.categoryId,
      windowIndex: row.windowIndex,
      totalMinor: Number(row.totalMinor),
      expenseCount: row.expenseCount
    }));
  }

  /**
   * Raw, narrow (id/category/amount/date only — never description/tags/
   * account) candidate + baseline pool rows bounded to ~210 days. The
   * large-expense detector needs per-candidate dynamic baselines (plan
   * §4.3), which PostgreSQL's ordered-set aggregates can't express as a
   * single fixed-window query, so the percentile math happens in the pure
   * detector instead — this is the one query that hands it raw rows.
   */
  async largeExpenseCandidatePool(
    userId: string,
    analysisBoundary: Date
  ): Promise<CandidateExpenseRow[]> {
    const rangeStart = new Date(
      analysisBoundary.getTime() - LARGE_EXPENSE_LOOKBACK_DAYS * 86_400_000
    );
    const rows = await this.db
      .select({
        transactionId: transactions.id,
        categoryId: transactions.categoryId,
        amountMinor: transactions.amountMinor,
        occurredAt: transactions.occurredAt
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          eq(transactions.type, "expense"),
          isNull(transactions.transferGroupId),
          gte(transactions.occurredAt, rangeStart),
          lt(transactions.occurredAt, analysisBoundary)
        )
      )
      .orderBy(transactions.occurredAt);
    return rows;
  }

  /** Earliest eligible-expense instant for this user, unbounded — backs the `historyStart` coverage field (plan §4.5). */
  async earliestEligibleExpenseAt(userId: string): Promise<Date | null> {
    // A raw `sql<>` aggregate column (unlike a plain schema-typed column
    // select) does not go through drizzle's column-level driver-value
    // parsing — node-postgres hands back the Postgres text representation
    // of the timestamptz (e.g. "2026-07-24 00:00:00+00"), not a JS Date.
    // Parse explicitly rather than trusting the `sql<Date | null>` type
    // annotation, which only affects compile-time inference.
    const [row] = await this.db
      .select({ earliest: sql<string | null>`min(${transactions.occurredAt})` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          eq(transactions.type, "expense"),
          isNull(transactions.transferGroupId)
        )
      );
    return row?.earliest === null || row?.earliest === undefined ? null : new Date(row.earliest);
  }

  async categoryNamesByIds(
    userId: string,
    categoryIds: readonly string[]
  ): Promise<Map<string, string>> {
    if (categoryIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(and(eq(categories.userId, userId), inArray(categories.id, [...categoryIds])));
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async getAnalysisState(userId: string): Promise<AnalysisStateRow | null> {
    const [row] = await this.db
      .select()
      .from(spendingWarningAnalysisState)
      .where(eq(spendingWarningAnalysisState.userId, userId));
    if (row === undefined) return null;
    return {
      detectorVersion: row.detectorVersion,
      status: row.status,
      computedAt: row.computedAt,
      sourceThrough: row.sourceThrough,
      historyStart: row.historyStart,
      baselineExpenseCount: row.baselineExpenseCount,
      eligibleKinds: SpendingWarningEligibleKindsSchema.parse(row.eligibleKinds)
    };
  }

  async list(
    userId: string,
    query: ListSpendingWarningsQuery
  ): Promise<{ items: SpendingWarning[]; pageInfo: PageInfo }> {
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const conditions = [eq(spendingWarnings.userId, userId), eq(spendingWarnings.status, "active")];
    if (query.kind !== undefined) conditions.push(eq(spendingWarnings.kind, query.kind));
    if (query.severity !== undefined)
      conditions.push(eq(spendingWarnings.severity, query.severity));
    if (cursor !== null) {
      conditions.push(
        sql`(${spendingWarnings.lastDetectedAt}, ${spendingWarnings.id}) < (${cursor.lastDetectedAt}, ${cursor.id})`
      );
    }

    const rows = await this.db
      .select()
      .from(spendingWarnings)
      .where(and(...conditions))
      .orderBy(sql`${spendingWarnings.lastDetectedAt} desc`, sql`${spendingWarnings.id} desc`)
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const items = page.map((row) => SpendingWarningSchema.parse(stripNulls(row)));
    const last = items.at(-1);
    const hasMore = rows.length > query.limit;
    const nextCursor =
      hasMore && last !== undefined ? encodeCursor(last.lastDetectedAt, last.id) : null;

    return { items, pageInfo: { nextCursor, hasMore, limit: query.limit } };
  }

  async findActiveById(userId: string, warningId: string): Promise<SpendingWarning | null> {
    const [row] = await this.db
      .select()
      .from(spendingWarnings)
      .where(and(eq(spendingWarnings.id, warningId), eq(spendingWarnings.userId, userId)));
    return row === undefined ? null : SpendingWarningSchema.parse(stripNulls(row));
  }

  /**
   * Idempotent: moving an already-dismissed warning to dismissed again
   * returns the existing row (with `transitioned: false`) rather than
   * erroring — the caller (IdempotencyPostgresService) is the primary
   * idempotency guard, this is a defensive second layer for the "not the
   * first repeated request to observe the row" race. `transitioned`
   * tells the service whether to write a fresh audit event: exactly one
   * audit effect per genuine state transition, even under 5 concurrent
   * identical dismiss attempts (plan §11).
   */
  async markDismissed(
    userId: string,
    warningId: string,
    dismissedAt: Date,
    tx: DbTx
  ): Promise<Readonly<{ warning: SpendingWarning; transitioned: boolean }> | null> {
    const [row] = await tx
      .update(spendingWarnings)
      .set({ status: "dismissed", dismissedAt })
      .where(
        and(
          eq(spendingWarnings.id, warningId),
          eq(spendingWarnings.userId, userId),
          eq(spendingWarnings.status, "active")
        )
      )
      .returning();
    if (row !== undefined) {
      return { warning: SpendingWarningSchema.parse(stripNulls(row)), transitioned: true };
    }
    // Not currently active: either already dismissed (a natural idempotent
    // replay — return it as-is) or resolved/nonexistent (nothing dismissable).
    const [existing] = await tx
      .select()
      .from(spendingWarnings)
      .where(
        and(
          eq(spendingWarnings.id, warningId),
          eq(spendingWarnings.userId, userId),
          eq(spendingWarnings.status, "dismissed")
        )
      );
    return existing === undefined
      ? null
      : { warning: SpendingWarningSchema.parse(stripNulls(existing)), transitioned: false };
  }

  /**
   * Upserts every current finding, resolves formerly-active warnings that
   * no longer reproduce, and persists analysis state — one Postgres
   * transaction (plan §5). A dismissed episode's `status` is preserved
   * (never resurrected to `active` by a re-run); a `resolved` episode that
   * reproduces under the same fingerprint returns to `active`.
   */
  async reconcile(
    userId: string,
    findings: readonly SpendingWarningUpsertInput[],
    analysisState: AnalysisStateRow
  ): Promise<void> {
    await withTxn(this.db, async (tx) => {
      const now = analysisState.computedAt;

      for (const finding of findings) {
        await tx
          .insert(spendingWarnings)
          .values({
            userId,
            fingerprint: finding.fingerprint,
            kind: finding.kind,
            severity: finding.severity,
            status: "active",
            categoryId: finding.categoryId,
            transactionId: finding.transactionId,
            windowStart: finding.windowStart,
            windowEnd: finding.windowEnd,
            evidence: finding.evidence,
            detectorVersion: finding.detectorVersion,
            firstDetectedAt: now,
            lastDetectedAt: now,
            dismissedAt: null,
            resolvedAt: null
          })
          .onConflictDoUpdate({
            target: [spendingWarnings.userId, spendingWarnings.fingerprint],
            set: {
              severity: finding.severity,
              categoryId: finding.categoryId,
              transactionId: finding.transactionId,
              windowStart: finding.windowStart,
              windowEnd: finding.windowEnd,
              evidence: finding.evidence,
              detectorVersion: finding.detectorVersion,
              lastDetectedAt: now,
              status: sql`case when ${spendingWarnings.status} = 'dismissed' then ${spendingWarnings.status} else 'active' end`,
              resolvedAt: sql`case when ${spendingWarnings.status} = 'dismissed' then ${spendingWarnings.resolvedAt} else null end`
            }
          });
      }

      const currentFingerprints = findings.map((f) => f.fingerprint);
      const resolveConditions = [
        eq(spendingWarnings.userId, userId),
        eq(spendingWarnings.status, "active")
      ];
      if (currentFingerprints.length > 0) {
        resolveConditions.push(notInArray(spendingWarnings.fingerprint, currentFingerprints));
      }
      await tx
        .update(spendingWarnings)
        .set({ status: "resolved", resolvedAt: now })
        .where(and(...resolveConditions));

      await tx
        .insert(spendingWarningAnalysisState)
        .values({
          userId,
          detectorVersion: analysisState.detectorVersion,
          status: analysisState.status,
          computedAt: analysisState.computedAt,
          sourceThrough: analysisState.sourceThrough,
          historyStart: analysisState.historyStart,
          baselineExpenseCount: analysisState.baselineExpenseCount,
          eligibleKinds: analysisState.eligibleKinds
        })
        .onConflictDoUpdate({
          target: spendingWarningAnalysisState.userId,
          set: {
            detectorVersion: analysisState.detectorVersion,
            status: analysisState.status,
            computedAt: analysisState.computedAt,
            sourceThrough: analysisState.sourceThrough,
            historyStart: analysisState.historyStart,
            baselineExpenseCount: analysisState.baselineExpenseCount,
            eligibleKinds: analysisState.eligibleKinds
          }
        });
    });
  }
}

function encodeCursor(lastDetectedAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ lastDetectedAt: lastDetectedAt.toISOString(), id }),
    "utf8"
  ).toString("base64url");
}

function decodeCursor(cursor: string): { lastDetectedAt: Date; id: string } {
  try {
    const payload = CursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    );
    return { lastDetectedAt: new Date(payload.lastDetectedAt), id: payload.id };
  } catch {
    throw new InvalidCursorError();
  }
}
