import { Inject, Injectable } from "@nestjs/common";
import {
  TransactionInsightsSchema,
  TransactionSchema,
  parseSafeIntegerMinor,
  type CreditCardBillId,
  type CreateTransaction,
  type ImportBatchId,
  type ListTransactionsQuery,
  type Month,
  type ParsedRow,
  type Transaction,
  type TransactionInsights,
  type TransactionPage,
  type TransactionSource,
  type TransactionType,
  type UpdateTransaction
} from "@treasury-ops/shared";
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { InvalidCursorError } from "../common/errors/invalid-cursor.error.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { categories, recurringReconciliations, transactions } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";
import { istMonthBounds, listISTMonthDayKeys } from "../common/time/ist.js";
import { normalizeTransactionText } from "../common/transaction-text/normalize-transaction-text.js";

const CursorPayloadSchema = z.object({ occurredAt: z.string().datetime(), id: z.string().uuid() });
const IST_TIME_ZONE = "Asia/Kolkata";

export type ReconciliationCandidateQuery = Readonly<{
  accountId: string;
  from: Date;
  toExclusive: Date;
  types: readonly TransactionType[];
  amountMinors: readonly number[];
  limit: number;
}>;

export type ReconciliationCandidateResult = Readonly<{
  items: readonly Transaction[];
  limitHit: boolean;
}>;

@Injectable()
export class TransactionRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    input: CreateTransaction,
    idempotencyKey: string | undefined,
    tx: DbTx,
    transferGroupId?: string,
    source: TransactionSource = "manual",
    billId?: CreditCardBillId,
    recurringRuleId?: string
  ): Promise<Transaction> {
    const now = new Date();
    const [row] = await tx
      .insert(transactions)
      .values({
        userId,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        type: input.type,
        amountMinor: input.amountMinor,
        currency: "INR",
        occurredAt: input.occurredAt,
        description: input.description,
        tags: input.tags,
        source,
        status: "posted",
        idempotencyKey: idempotencyKey ?? null,
        transferGroupId: transferGroupId ?? null,
        billId: billId ?? null,
        recurringRuleId: recurringRuleId ?? null,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Transaction insert did not return a row.");
    return toTransaction(row);
  }

  /**
   * Worker-only discovery for reconciliation recovery. This is intentionally
   * a `system*` method because it scans across tenants; each returned row
   * carries its owning userId, and every subsequent read/write is routed
   * through tenant-scoped reconciliation methods.
   */
  async systemFindRecentUnreconciledApiTransactions(
    occurredSince: Date,
    limit: number
  ): Promise<Transaction[]> {
    const rows = await this.db
      .select({ transaction: transactions })
      .from(transactions)
      .leftJoin(
        recurringReconciliations,
        eq(recurringReconciliations.incomingTransactionId, transactions.id)
      )
      .where(
        and(
          eq(transactions.source, "api"),
          eq(transactions.status, "posted"),
          gte(transactions.occurredAt, occurredSince),
          isNull(transactions.recurringRuleId),
          isNull(recurringReconciliations.id)
        )
      )
      .orderBy(desc(transactions.occurredAt), desc(transactions.id))
      .limit(limit);
    return rows.map((row) => toTransaction(row.transaction));
  }

  async findMany(userId: string, query: ListTransactionsQuery): Promise<TransactionPage> {
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const conditions = [eq(transactions.userId, userId)];
    if (query.accountId !== undefined) conditions.push(eq(transactions.accountId, query.accountId));
    if (query.categoryId !== undefined)
      conditions.push(eq(transactions.categoryId, query.categoryId));
    if (query.from !== undefined) conditions.push(gte(transactions.occurredAt, query.from));
    if (query.to !== undefined) conditions.push(lte(transactions.occurredAt, query.to));
    if (query.q !== undefined) {
      conditions.push(sql`${transactions.description} ILIKE ${"%" + escapeLike(query.q) + "%"}`);
    }
    if (query.tag !== undefined) {
      conditions.push(sql`${query.tag} = ANY(${transactions.tags})`);
    }
    if (cursor !== null) {
      conditions.push(
        sql`(${transactions.occurredAt}, ${transactions.id}) < (${cursor.occurredAt}, ${cursor.id})`
      );
    }

    const rows = await this.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.occurredAt), desc(transactions.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const items = page.map(toTransaction);
    const last = items.at(-1);
    const hasMore = rows.length > query.limit;
    const nextCursor =
      hasMore && last !== undefined ? encodeCursor(last.occurredAt, last.id) : null;

    return { items, pageInfo: { nextCursor, hasMore, limit: query.limit } };
  }

  /**
   * A compact, live read model for the transaction page. Counts represent
   * logical ledger entries: the two legs of one transfer share a group id
   * and count once, while reversals remain separate append-only activity.
   * Spending rankings exclude transfers and non-posted rows so moving money
   * between owned accounts cannot become a user's "largest expense".
   */
  async getInsights(userId: string, month: Month): Promise<TransactionInsights> {
    const { start, end } = istMonthBounds(month);
    const monthlyWhere = and(
      eq(transactions.userId, userId),
      gte(transactions.occurredAt, start),
      lt(transactions.occurredAt, end)
    );
    const postedExpenseWhere = and(
      monthlyWhere,
      eq(transactions.status, "posted"),
      eq(transactions.type, "expense"),
      isNull(transactions.transferGroupId)
    );
    const logicalTransactionId = sql<string>`coalesce(${transactions.transferGroupId}::text, ${transactions.id}::text)`;
    const istDay = sql<string>`to_char(${transactions.occurredAt} AT TIME ZONE ${IST_TIME_ZONE}, 'YYYY-MM-DD')`;
    const spentTotal = sql<string>`sum(${transactions.amountMinor})::bigint`;

    const [monthlyRows, dailyRows, highestRows, topCategoryRows, lifetimeRows] = await Promise.all([
      this.db
        .select({
          transactionCount: sql<string>`count(distinct ${logicalTransactionId})::bigint`
        })
        .from(transactions)
        .where(monthlyWhere),
      this.db
        .select({
          date: istDay,
          transactionCount: sql<string>`count(distinct ${logicalTransactionId})::bigint`
        })
        .from(transactions)
        .where(monthlyWhere)
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      this.db
        .select({
          id: transactions.id,
          description: transactions.description,
          amountMinor: transactions.amountMinor,
          occurredAt: transactions.occurredAt
        })
        .from(transactions)
        .where(postedExpenseWhere)
        .orderBy(
          desc(transactions.amountMinor),
          desc(transactions.occurredAt),
          desc(transactions.id)
        )
        .limit(1),
      this.db
        .select({
          categoryId: transactions.categoryId,
          name: categories.name,
          color: categories.color,
          icon: categories.icon,
          amountMinor: spentTotal,
          transactionCount: sql<string>`count(*)::bigint`
        })
        .from(transactions)
        .leftJoin(
          categories,
          and(eq(categories.id, transactions.categoryId), eq(categories.userId, userId))
        )
        .where(postedExpenseWhere)
        .groupBy(transactions.categoryId, categories.name, categories.color, categories.icon)
        .orderBy(desc(spentTotal), transactions.categoryId)
        .limit(1),
      this.db
        .select({
          transactionCount: sql<string>`count(distinct ${logicalTransactionId})::bigint`
        })
        .from(transactions)
        .where(eq(transactions.userId, userId))
    ]);

    const dailyByDate = new Map(
      dailyRows.map((row) => [row.date, parseSafeIntegerMinor(row.transactionCount)])
    );
    const highest = highestRows[0];
    const topCategory = topCategoryRows[0];

    return TransactionInsightsSchema.parse({
      month,
      monthlyTransactionCount: parseSafeIntegerMinor(monthlyRows[0]?.transactionCount ?? 0),
      dailyActivity: listISTMonthDayKeys(month).map((date) => ({
        date,
        transactionCount: dailyByDate.get(date) ?? 0
      })),
      highestExpense:
        highest === undefined
          ? null
          : {
              id: highest.id,
              description: highest.description,
              amountMinor: highest.amountMinor,
              occurredAt: highest.occurredAt
            },
      topSpendingCategory:
        topCategory === undefined
          ? null
          : {
              ...(topCategory.categoryId === null ? {} : { categoryId: topCategory.categoryId }),
              name: topCategory.name ?? "Uncategorized",
              ...(topCategory.color === null ? {} : { color: topCategory.color }),
              ...(topCategory.icon === null ? {} : { icon: topCategory.icon }),
              amountMinor: parseSafeIntegerMinor(topCategory.amountMinor),
              transactionCount: parseSafeIntegerMinor(topCategory.transactionCount)
            },
      lifetimeTransactionCount: parseSafeIntegerMinor(lifetimeRows[0]?.transactionCount ?? 0)
    });
  }

  /**
   * Type-aware legacy v1 lookup: dedupe v1 (`dedupe-hash.ts`) hashed
   * userId|accountId|day|amountMinor|normalizedDescription without the
   * transaction type, so a same-day/same-amount expense and its reversal can
   * legitimately share one stored v1 hash. Returning `{hash, type}` pairs
   * (rather than a bare Set<string>) lets the caller only treat a v1 match as
   * a real duplicate when the incoming row's type also matches — v2 rows
   * never populate this column, so this only ever matches pre-migration data.
   */
  async findExistingDedupeHashes(
    userId: string,
    dedupeHashes: readonly string[]
  ): Promise<Map<string, TransactionType>> {
    if (dedupeHashes.length === 0) return new Map();
    const rows = await this.db
      .select({ dedupeHash: transactions.dedupeHash, type: transactions.type })
      .from(transactions)
      .where(
        and(eq(transactions.userId, userId), inArray(transactions.dedupeHash, [...dedupeHashes]))
      );
    const byHash = new Map<string, TransactionType>();
    for (const row of rows) {
      if (row.dedupeHash !== null) byHash.set(row.dedupeHash, row.type);
    }
    return byHash;
  }

  /**
   * Bulk existence check for the v2 fingerprint (type-aware) — one query for
   * the whole file's fingerprints rather than one round-trip per row.
   */
  async findExistingDedupeFingerprintsV2(
    userId: string,
    dedupeFingerprintsV2: readonly string[]
  ): Promise<Set<string>> {
    if (dedupeFingerprintsV2.length === 0) return new Set();
    const rows = await this.db
      .select({ dedupeFingerprintV2: transactions.dedupeFingerprintV2 })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.dedupeFingerprintV2, [...dedupeFingerprintsV2])
        )
      );
    return new Set(
      rows
        .map((row) => row.dedupeFingerprintV2)
        .filter((fingerprint): fingerprint is string => fingerprint !== null)
    );
  }

  /**
   * One bounded, tenant-scoped candidate window for near-duplicate review
   * evidence: every posted transaction on this account within a narrow
   * calendar window, regardless of type/amount — the caller groups and
   * filters in memory by (type, amountMinor, day) per staged row so a whole
   * import batch costs one query, not one per row. Bounded by `limit` per
   * the algorithm's declared resource contract.
   */
  async findNearDuplicateCandidateWindow(
    userId: string,
    accountId: string,
    windowStart: Date,
    windowEndExclusive: Date,
    limit: number
  ): Promise<
    Array<{
      transactionId: string;
      type: TransactionType;
      amountMinor: number;
      description: string;
      source: TransactionSource;
      occurredAt: Date;
    }>
  > {
    const rows = await this.db
      .select({
        transactionId: transactions.id,
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        description: transactions.description,
        source: transactions.source,
        occurredAt: transactions.occurredAt
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.accountId, accountId),
          eq(transactions.status, "posted"),
          gte(transactions.occurredAt, windowStart),
          lt(transactions.occurredAt, windowEndExclusive)
        )
      )
      .orderBy(transactions.occurredAt, transactions.id)
      .limit(limit);
    return rows;
  }

  async summarizeBillableCycle(
    userId: string,
    accountId: string,
    cycleStart: Date,
    cycleEndExclusive: Date,
    tx: DbTx
  ): Promise<number> {
    const [row] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(
          CASE
            WHEN ${transactions.type} = 'expense' THEN ${transactions.amountMinor}
            ELSE -${transactions.amountMinor}
          END
        ), 0)`.mapWith(Number)
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.accountId, accountId),
          eq(transactions.status, "posted"),
          isNull(transactions.billId),
          gte(transactions.occurredAt, cycleStart),
          lt(transactions.occurredAt, cycleEndExclusive)
        )
      );
    return Math.max(0, row?.total ?? 0);
  }

  async findReconciliationCandidates(
    userId: string,
    accountId: string,
    cycleStart: Date,
    cycleEndExclusive: Date
  ): Promise<Transaction[]> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.accountId, accountId),
          gte(transactions.occurredAt, cycleStart),
          lt(transactions.occurredAt, cycleEndExclusive)
        )
      )
      .orderBy(transactions.occurredAt, transactions.id);
    return rows.map(toTransaction);
  }

  /**
   * Bounded candidate blocking for statement assignment. The caller derives
   * the small type/amount/date sets from parsed statement rows; no narration
   * is part of this database predicate.
   */
  async findBoundedReconciliationCandidates(
    userId: string,
    query: ReconciliationCandidateQuery
  ): Promise<ReconciliationCandidateResult> {
    if (
      query.types.length === 0 ||
      query.amountMinors.length === 0 ||
      !Number.isSafeInteger(query.limit) ||
      query.limit < 1
    ) {
      return { items: [], limitHit: false };
    }
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.accountId, query.accountId),
          eq(transactions.status, "posted"),
          isNull(transactions.billId),
          inArray(transactions.type, [...query.types]),
          inArray(transactions.amountMinor, [...query.amountMinors]),
          gte(transactions.occurredAt, query.from),
          lt(transactions.occurredAt, query.toExclusive)
        )
      )
      .orderBy(transactions.occurredAt, transactions.id)
      .limit(query.limit + 1);
    return {
      items: rows.slice(0, query.limit).map(toTransaction),
      limitHit: rows.length > query.limit
    };
  }

  async sumPostedBillPayments(
    userId: string,
    billId: CreditCardBillId,
    tx?: DbTx
  ): Promise<number> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select({
        total: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)`.mapWith(Number)
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.billId, billId),
          eq(transactions.type, "income"),
          eq(transactions.status, "posted")
        )
      );
    return row?.total ?? 0;
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Transaction | null> {
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.idempotencyKey, idempotencyKey)));
    return row === undefined ? null : toTransaction(row);
  }

  async findPostedById(
    userId: string,
    transactionId: string,
    tx: DbTx
  ): Promise<Transaction | null> {
    const [row] = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          eq(transactions.status, "posted")
        )
      );
    return row === undefined ? null : toTransaction(row);
  }

  async findById(userId: string, transactionId: string, tx?: DbTx): Promise<Transaction | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
    return row === undefined ? null : toTransaction(row);
  }

  async findByIds(
    userId: string,
    transactionIds: readonly string[],
    tx: DbTx
  ): Promise<Transaction[]> {
    if (transactionIds.length === 0) return [];
    const rows = await tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), inArray(transactions.id, [...transactionIds])));
    return rows.map(toTransaction);
  }

  async assignCategory(
    userId: string,
    transactionIds: readonly string[],
    categoryId: string,
    tx: DbTx
  ): Promise<number> {
    if (transactionIds.length === 0) return 0;
    const rows = await tx
      .update(transactions)
      .set({ categoryId, updatedAt: new Date() })
      .where(and(eq(transactions.userId, userId), inArray(transactions.id, [...transactionIds])))
      .returning({ id: transactions.id });
    return rows.length;
  }

  async updateNonMonetaryFields(
    userId: string,
    transactionId: string,
    patch: UpdateTransaction,
    tx: DbTx
  ): Promise<Transaction | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.tags !== undefined) set.tags = patch.tags;
    if (patch.categoryId !== undefined) set.categoryId = patch.categoryId;

    const [row] = await tx
      .update(transactions)
      .set(set)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
      .returning();
    return row === undefined ? null : toTransaction(row);
  }

  async attachToRecurringRule(
    userId: string,
    transactionId: string,
    recurringRuleId: string,
    tx: DbTx
  ): Promise<Transaction | null> {
    const [row] = await tx
      .update(transactions)
      .set({ recurringRuleId, updatedAt: new Date() })
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          isNull(transactions.recurringRuleId)
        )
      )
      .returning();
    return row === undefined ? null : toTransaction(row);
  }

  async attachToTransferGroup(
    userId: string,
    transactionId: string,
    transferGroupId: string,
    tx: DbTx
  ): Promise<Transaction | null> {
    const [row] = await tx
      .update(transactions)
      .set({ transferGroupId, updatedAt: new Date() })
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          eq(transactions.status, "posted"),
          isNull(transactions.transferGroupId)
        )
      )
      .returning();
    return row === undefined ? null : toTransaction(row);
  }

  async findByReversalOf(userId: string, transactionId: string): Promise<Transaction | null> {
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.reversalOf, transactionId)));
    return row === undefined ? null : toTransaction(row);
  }

  async createReversal(
    userId: string,
    original: Transaction,
    tx: DbTx,
    transferGroupId?: string
  ): Promise<Transaction> {
    const now = new Date();
    const [row] = await tx
      .insert(transactions)
      .values({
        userId,
        accountId: original.accountId,
        categoryId: original.categoryId ?? null,
        type: original.type === "expense" ? "income" : "expense",
        amountMinor: original.amountMinor,
        currency: "INR",
        occurredAt: now,
        description: `Reversal: ${original.description}`,
        tags: original.tags,
        source: "manual",
        status: "reversal",
        reversalOf: original.id,
        transferGroupId: transferGroupId ?? null,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Reversal insert did not return a row.");
    return toTransaction(row);
  }

  /**
   * Persists `dedupeFingerprintV2` (type-aware) only — new rows deliberately
   * leave the legacy `dedupeHash` column null rather than repopulating it, so
   * the type-blind v1 unique index can never collide across two genuinely
   * different, differently-typed transactions going forward. Old rows keep
   * whatever v1 hash they already have; see `findExistingDedupeHashes`.
   */
  async insertImportedRows(
    userId: string,
    accountId: string,
    importBatchId: ImportBatchId,
    rows: readonly (ParsedRow & { dedupeFingerprintV2: string; categoryId?: string })[],
    tx: DbTx
  ): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date();
    await tx.insert(transactions).values(
      rows.map((row) => ({
        userId,
        accountId,
        categoryId: row.categoryId ?? null,
        type: row.type,
        amountMinor: row.amountMinor,
        currency: "INR" as const,
        occurredAt: row.occurredAt,
        description: row.description,
        tags: [],
        source: "csv_import" as const,
        status: "posted" as const,
        importBatchId,
        dedupeFingerprintV2: row.dedupeFingerprintV2,
        createdAt: now,
        updatedAt: now
      }))
    );
  }

  async findPostedByImportBatchId(
    userId: string,
    importBatchId: ImportBatchId
  ): Promise<Transaction[]> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.importBatchId, importBatchId),
          eq(transactions.status, "posted")
        )
      );
    return rows.map(toTransaction);
  }

  /**
   * Bulk compensating-entry reversal for import revert: one reversal doc
   * per original + one bulk update flipping every original to "reversed",
   * both within the caller's chunk transaction. Mirrors createReversal +
   * markReversed's per-row logic, batched.
   */
  async insertBulkReversals(
    userId: string,
    originals: readonly Transaction[],
    tx: DbTx
  ): Promise<Transaction[]> {
    if (originals.length === 0) return [];
    const now = new Date();
    const inserted = await tx
      .insert(transactions)
      .values(
        originals.map((original) => ({
          userId,
          accountId: original.accountId,
          categoryId: original.categoryId ?? null,
          type: original.type === "expense" ? ("income" as const) : ("expense" as const),
          amountMinor: original.amountMinor,
          currency: "INR" as const,
          occurredAt: now,
          description: `Reversal: ${original.description}`,
          tags: original.tags,
          source: "manual" as const,
          status: "reversal" as const,
          reversalOf: original.id,
          createdAt: now,
          updatedAt: now
        }))
      )
      .returning();

    for (const [index, original] of originals.entries()) {
      const reversal = inserted[index];
      if (reversal === undefined)
        throw new Error("Reversal insert did not return a row for every original.");
      await tx
        .update(transactions)
        .set({ status: "reversed", reversedBy: reversal.id, updatedAt: now })
        .where(
          and(
            eq(transactions.id, original.id),
            eq(transactions.userId, userId),
            eq(transactions.status, "posted")
          )
        );
    }

    return inserted.map(toTransaction);
  }

  async findPostedLegsByTransferGroupId(
    userId: string,
    transferGroupId: string,
    tx: DbTx
  ): Promise<Transaction[]> {
    const rows = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.transferGroupId, transferGroupId),
          eq(transactions.status, "posted")
        )
      );
    return rows.map(toTransaction);
  }

  async findLegsByTransferGroupId(userId: string, transferGroupId: string): Promise<Transaction[]> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.userId, userId), eq(transactions.transferGroupId, transferGroupId))
      );
    return rows.map(toTransaction);
  }

  async markReversed(
    userId: string,
    transactionId: string,
    reversalId: string,
    tx: DbTx
  ): Promise<boolean> {
    const rows = await tx
      .update(transactions)
      .set({ status: "reversed", reversedBy: reversalId, updatedAt: new Date() })
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          eq(transactions.status, "posted")
        )
      )
      .returning({ id: transactions.id });
    return rows.length === 1;
  }
}

type TransactionRow = typeof transactions.$inferSelect;

function toTransaction(row: TransactionRow): Transaction {
  const normalized = normalizeTransactionText(row.description);
  return TransactionSchema.parse({
    ...stripNulls(row),
    paymentRail: normalized.paymentRail,
    counterpartyHandle: normalized.counterpartyHandle
  });
}

function encodeCursor(occurredAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ occurredAt: occurredAt.toISOString(), id }), "utf8").toString(
    "base64url"
  );
}

function decodeCursor(cursor: string): { occurredAt: Date; id: string } {
  try {
    const payload = CursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    );
    return { occurredAt: new Date(payload.occurredAt), id: payload.id };
  } catch {
    throw new InvalidCursorError();
  }
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}
