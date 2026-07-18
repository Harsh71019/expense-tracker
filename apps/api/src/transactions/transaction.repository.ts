import { Inject, Injectable } from "@nestjs/common";
import {
  TransactionSchema,
  type CreateTransaction,
  type ImportBatchId,
  type ListTransactionsQuery,
  type ParsedRow,
  type Transaction,
  type TransactionPage,
  type TransactionSource,
  type UpdateTransaction
} from "@vyaya/shared";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { InvalidCursorError } from "../common/errors/invalid-cursor.error.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { transactions } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";
import type { DbTx } from "../common/db/db-txn.js";

const CursorPayloadSchema = z.object({ occurredAt: z.string().datetime(), id: z.string().uuid() });

@Injectable()
export class TransactionRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    input: CreateTransaction,
    idempotencyKey: string | undefined,
    tx: DbTx,
    transferGroupId?: string,
    source: TransactionSource = "manual"
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
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Transaction insert did not return a row.");
    return TransactionSchema.parse(stripNulls(row));
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
    const items = page.map((row) => TransactionSchema.parse(stripNulls(row)));
    const last = items.at(-1);
    const hasMore = rows.length > query.limit;
    const nextCursor =
      hasMore && last !== undefined ? encodeCursor(last.occurredAt, last.id) : null;

    return { items, pageInfo: { nextCursor, hasMore, limit: query.limit } };
  }

  /**
   * Bulk existence check for the CSV import dedupe pass — one query for the
   * whole file's dedupeHashes rather than one round-trip per row.
   */
  async findExistingDedupeHashes(
    userId: string,
    dedupeHashes: readonly string[]
  ): Promise<Set<string>> {
    if (dedupeHashes.length === 0) return new Set();
    const rows = await this.db
      .select({ dedupeHash: transactions.dedupeHash })
      .from(transactions)
      .where(
        and(eq(transactions.userId, userId), inArray(transactions.dedupeHash, [...dedupeHashes]))
      );
    return new Set(
      rows.map((row) => row.dedupeHash).filter((hash): hash is string => hash !== null)
    );
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Transaction | null> {
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.idempotencyKey, idempotencyKey)));
    return row === undefined ? null : TransactionSchema.parse(stripNulls(row));
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
    return row === undefined ? null : TransactionSchema.parse(stripNulls(row));
  }

  async findById(userId: string, transactionId: string, tx?: DbTx): Promise<Transaction | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
    return row === undefined ? null : TransactionSchema.parse(stripNulls(row));
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
    return row === undefined ? null : TransactionSchema.parse(stripNulls(row));
  }

  async findByReversalOf(userId: string, transactionId: string): Promise<Transaction | null> {
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.reversalOf, transactionId)));
    return row === undefined ? null : TransactionSchema.parse(stripNulls(row));
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
    return TransactionSchema.parse(stripNulls(row));
  }

  async insertImportedRows(
    userId: string,
    accountId: string,
    importBatchId: ImportBatchId,
    rows: readonly (ParsedRow & { dedupeHash: string; categoryId?: string })[],
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
        dedupeHash: row.dedupeHash,
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
    return rows.map((row) => TransactionSchema.parse(stripNulls(row)));
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

    return inserted.map((row) => TransactionSchema.parse(stripNulls(row)));
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
    return rows.map((row) => TransactionSchema.parse(stripNulls(row)));
  }

  async findLegsByTransferGroupId(userId: string, transferGroupId: string): Promise<Transaction[]> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.userId, userId), eq(transactions.transferGroupId, transferGroupId))
      );
    return rows.map((row) => TransactionSchema.parse(stripNulls(row)));
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
