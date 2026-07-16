import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  TransactionSchema,
  TransactionSourceSchema,
  type CreateTransaction,
  type ImportBatchId,
  type ListTransactionsQuery,
  type ParsedRow,
  type Transaction,
  type TransactionPage,
  type UpdateTransaction
} from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";
import { z } from "zod";

import { InvalidCursorError } from "../common/errors/invalid-cursor.error.js";
import type { MongoSession } from "../common/mongo-txn.js";

const TRANSACTIONS_COLLECTION = "transactions";

const CursorPayloadSchema = z.object({
  occurredAt: z.string().datetime(),
  id: z.string().regex(/^[a-f\d]{24}$/i)
});

const StoredTransactionSchema = z.object({
  _id: z.unknown(),
  userId: z.string(),
  accountId: z.unknown(),
  categoryId: z.unknown().optional(),
  type: z.enum(["expense", "income"]),
  amountMinor: z.number().int().positive(),
  occurredAt: z.date(),
  description: z.string(),
  tags: z.array(z.string()),
  currency: z.literal("INR"),
  source: TransactionSourceSchema,
  status: z.enum(["posted", "reversed", "reversal"]),
  idempotencyKey: z.string().uuid().optional(),
  reversalOf: z.unknown().optional(),
  reversedBy: z.unknown().optional(),
  transferGroupId: z.unknown().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

@Injectable()
export class TransactionRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async create(
    userId: string,
    input: CreateTransaction,
    idempotencyKey: string | undefined,
    session: MongoSession,
    transferGroupId?: string
  ): Promise<Transaction> {
    const now = new Date();
    const category =
      input.categoryId === undefined ? {} : { categoryId: new Types.ObjectId(input.categoryId) };
    const idempotency = idempotencyKey === undefined ? {} : { idempotencyKey };
    const transfer =
      transferGroupId === undefined ? {} : { transferGroupId: new Types.ObjectId(transferGroupId) };
    const document = {
      userId,
      accountId: new Types.ObjectId(input.accountId),
      ...category,
      type: input.type,
      amountMinor: input.amountMinor,
      currency: "INR" as const,
      occurredAt: input.occurredAt,
      description: input.description,
      tags: input.tags,
      source: "manual" as const,
      status: "posted" as const,
      ...idempotency,
      ...transfer,
      createdAt: now,
      updatedAt: now
    };
    const result = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .insertOne(document, { session });
    return this.toTransaction({ _id: result.insertedId, ...document });
  }

  async findMany(userId: string, query: ListTransactionsQuery): Promise<TransactionPage> {
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const occurredAtRange = {
      ...(query.from === undefined ? {} : { $gte: query.from }),
      ...(query.to === undefined ? {} : { $lte: query.to })
    };

    const filter: Record<string, unknown> = {
      userId,
      ...(query.accountId === undefined ? {} : { accountId: new Types.ObjectId(query.accountId) }),
      ...(query.categoryId === undefined
        ? {}
        : { categoryId: new Types.ObjectId(query.categoryId) }),
      ...(Object.keys(occurredAtRange).length === 0 ? {} : { occurredAt: occurredAtRange }),
      ...(query.q === undefined
        ? {}
        : { description: { $regex: escapeRegExp(query.q), $options: "i" } }),
      ...(cursor === null
        ? {}
        : {
            $or: [
              { occurredAt: { $lt: cursor.occurredAt } },
              { occurredAt: cursor.occurredAt, _id: { $lt: new Types.ObjectId(cursor.id) } }
            ]
          })
    };

    const documents = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .find(filter)
      .sort({ occurredAt: -1, _id: -1 })
      .limit(query.limit + 1)
      .toArray();

    const page = documents.slice(0, query.limit);
    const items = page.map((document) => this.toTransaction(document));
    const last = items.at(-1);
    const hasMore = documents.length > query.limit;
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

    const documents = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .find({ userId, dedupeHash: { $in: [...dedupeHashes] } }, { projection: { dedupeHash: 1 } })
      .toArray();

    return new Set(
      documents
        .map((document) => document.dedupeHash)
        .filter((hash): hash is string => typeof hash === "string")
    );
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Transaction | null> {
    const transaction = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .findOne({ userId, idempotencyKey });
    return transaction === null ? null : this.toTransaction(transaction);
  }

  async findPostedById(
    userId: string,
    transactionId: string,
    session: MongoSession
  ): Promise<Transaction | null> {
    const transaction = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .findOne({ _id: new Types.ObjectId(transactionId), userId, status: "posted" }, { session });
    return transaction === null ? null : this.toTransaction(transaction);
  }

  async findById(
    userId: string,
    transactionId: string,
    session: MongoSession
  ): Promise<Transaction | null> {
    const transaction = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .findOne({ _id: new Types.ObjectId(transactionId), userId }, { session });
    return transaction === null ? null : this.toTransaction(transaction);
  }

  async updateNonMonetaryFields(
    userId: string,
    transactionId: string,
    patch: UpdateTransaction,
    session: MongoSession
  ): Promise<Transaction | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    const unset: Record<string, ""> = {};
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.tags !== undefined) set.tags = patch.tags;
    if (patch.categoryId !== undefined) {
      if (patch.categoryId === null) {
        unset.categoryId = "";
      } else {
        set.categoryId = new Types.ObjectId(patch.categoryId);
      }
    }

    const result = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .findOneAndUpdate(
        { _id: new Types.ObjectId(transactionId), userId },
        { $set: set, ...(Object.keys(unset).length === 0 ? {} : { $unset: unset }) },
        { session, returnDocument: "after" }
      );
    return result === null ? null : this.toTransaction(result);
  }

  async findByReversalOf(userId: string, transactionId: string): Promise<Transaction | null> {
    const transaction = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .findOne({ userId, reversalOf: new Types.ObjectId(transactionId) });
    return transaction === null ? null : this.toTransaction(transaction);
  }

  async createReversal(
    userId: string,
    original: Transaction,
    session: MongoSession,
    transferGroupId?: string
  ): Promise<Transaction> {
    const now = new Date();
    const category =
      original.categoryId === undefined
        ? {}
        : { categoryId: new Types.ObjectId(original.categoryId) };
    const transfer =
      transferGroupId === undefined ? {} : { transferGroupId: new Types.ObjectId(transferGroupId) };
    const document = {
      userId,
      accountId: new Types.ObjectId(original.accountId),
      ...category,
      type: original.type === "expense" ? ("income" as const) : ("expense" as const),
      amountMinor: original.amountMinor,
      currency: "INR" as const,
      occurredAt: now,
      description: `Reversal: ${original.description}`,
      tags: original.tags,
      source: "manual" as const,
      status: "reversal" as const,
      reversalOf: new Types.ObjectId(original.id),
      ...transfer,
      createdAt: now,
      updatedAt: now
    };
    const result = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .insertOne(document, { session });
    return this.toTransaction({ _id: result.insertedId, ...document });
  }

  /**
   * Bulk-inserts one chunk of a CSV import commit — `source: 'csv_import'`,
   * `importBatchId`, `dedupeHash` carried for provenance/resumability, but
   * deliberately not surfaced on the public `Transaction` type (internal
   * bookkeeping only, per StoredTransactionSchema/toTransaction). Not
   * wrapped in idempotency-key duplicate handling like create() — resumable
   * commit dedupes by pre-filtering against findExistingDedupeHashes before
   * this is ever called, not by catching a duplicate-key error here.
   */
  async insertImportedRows(
    userId: string,
    accountId: string,
    importBatchId: ImportBatchId,
    rows: readonly (ParsedRow & { dedupeHash: string; categoryId?: string })[],
    session: MongoSession
  ): Promise<void> {
    if (rows.length === 0) return;

    const now = new Date();
    const documents = rows.map((row) => ({
      userId,
      accountId: new Types.ObjectId(accountId),
      ...(row.categoryId === undefined ? {} : { categoryId: new Types.ObjectId(row.categoryId) }),
      type: row.type,
      amountMinor: row.amountMinor,
      currency: "INR" as const,
      occurredAt: row.occurredAt,
      description: row.description,
      tags: [] as const,
      source: "csv_import" as const,
      status: "posted" as const,
      importBatchId: new Types.ObjectId(importBatchId),
      dedupeHash: row.dedupeHash,
      createdAt: now,
      updatedAt: now
    }));

    await this.database().collection(TRANSACTIONS_COLLECTION).insertMany(documents, { session });
  }

  async findPostedByImportBatchId(
    userId: string,
    importBatchId: ImportBatchId
  ): Promise<Transaction[]> {
    const documents = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .find({ userId, importBatchId: new Types.ObjectId(importBatchId), status: "posted" })
      .toArray();
    return documents.map((document) => this.toTransaction(document));
  }

  /**
   * Bulk compensating-entry reversal for import revert: one reversal doc
   * per original + one updateMany flipping every original to "reversed",
   * both within the caller's chunk transaction. Mirrors createReversal +
   * markReversed's per-row logic, batched.
   */
  async insertBulkReversals(
    userId: string,
    originals: readonly Transaction[],
    session: MongoSession
  ): Promise<Transaction[]> {
    if (originals.length === 0) return [];

    const now = new Date();
    const pairs = originals.map((original) => ({ original, reversalId: new Types.ObjectId() }));
    const documents = pairs.map(({ original, reversalId }) => {
      const category =
        original.categoryId === undefined
          ? {}
          : { categoryId: new Types.ObjectId(original.categoryId) };
      return {
        _id: reversalId,
        userId,
        accountId: new Types.ObjectId(original.accountId),
        ...category,
        type: original.type === "expense" ? ("income" as const) : ("expense" as const),
        amountMinor: original.amountMinor,
        currency: "INR" as const,
        occurredAt: now,
        description: `Reversal: ${original.description}`,
        tags: original.tags,
        source: "manual" as const,
        status: "reversal" as const,
        reversalOf: new Types.ObjectId(original.id),
        createdAt: now,
        updatedAt: now
      };
    });

    await this.database().collection(TRANSACTIONS_COLLECTION).insertMany(documents, { session });

    const bulkOps = pairs.map(({ original, reversalId }) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(original.id), userId, status: "posted" as const },
        update: { $set: { status: "reversed" as const, reversedBy: reversalId, updatedAt: now } }
      }
    }));
    await this.database().collection(TRANSACTIONS_COLLECTION).bulkWrite(bulkOps, { session });

    return documents.map((document) => this.toTransaction(document));
  }

  async findPostedLegsByTransferGroupId(
    userId: string,
    transferGroupId: string,
    session: MongoSession
  ): Promise<Transaction[]> {
    const documents = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .find(
        { userId, transferGroupId: new Types.ObjectId(transferGroupId), status: "posted" },
        { session }
      )
      .toArray();
    return documents.map((document) => this.toTransaction(document));
  }

  async findLegsByTransferGroupId(userId: string, transferGroupId: string): Promise<Transaction[]> {
    const documents = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .find({ userId, transferGroupId: new Types.ObjectId(transferGroupId) })
      .toArray();
    return documents.map((document) => this.toTransaction(document));
  }

  async markReversed(
    userId: string,
    transactionId: string,
    reversalId: string,
    session: MongoSession
  ): Promise<boolean> {
    const result = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .updateOne(
        { _id: new Types.ObjectId(transactionId), userId, status: "posted" },
        {
          $set: {
            status: "reversed",
            reversedBy: new Types.ObjectId(reversalId),
            updatedAt: new Date()
          }
        },
        { session }
      );
    return result.modifiedCount === 1;
  }

  private toTransaction(value: unknown): Transaction {
    const stored = StoredTransactionSchema.parse(value);
    const category =
      stored.categoryId === undefined ? {} : { categoryId: objectIdString(stored.categoryId) };
    const idempotency =
      stored.idempotencyKey === undefined ? {} : { idempotencyKey: stored.idempotencyKey };
    const reversalOf =
      stored.reversalOf === undefined ? {} : { reversalOf: objectIdString(stored.reversalOf) };
    const reversedBy =
      stored.reversedBy === undefined ? {} : { reversedBy: objectIdString(stored.reversedBy) };
    const transferGroupId =
      stored.transferGroupId === undefined
        ? {}
        : { transferGroupId: objectIdString(stored.transferGroupId) };
    return TransactionSchema.parse({
      id: objectIdString(stored._id),
      userId: stored.userId,
      accountId: objectIdString(stored.accountId),
      ...category,
      type: stored.type,
      amountMinor: stored.amountMinor,
      occurredAt: stored.occurredAt,
      description: stored.description,
      tags: stored.tags,
      currency: stored.currency,
      source: stored.source,
      status: stored.status,
      ...idempotency,
      ...reversalOf,
      ...reversedBy,
      ...transferGroupId,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt
    });
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) throw new Error("MongoDB connection is not ready");
    return database;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function objectIdString(value: unknown): string {
  if (typeof value !== "object" || value === null || !("toString" in value)) {
    throw new Error("MongoDB document contains an invalid ObjectId.");
  }
  const stringify = value.toString;
  if (typeof stringify !== "function")
    throw new Error("MongoDB document contains an invalid ObjectId.");
  return stringify.call(value);
}
