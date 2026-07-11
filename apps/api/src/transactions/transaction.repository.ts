import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { TransactionSchema, type CreateTransaction, type Transaction } from "@vyaya/shared";
import { Types } from "mongoose";
import type { Connection } from "mongoose";
import { z } from "zod";

import type { MongoSession } from "../common/mongo-txn.js";

const TRANSACTIONS_COLLECTION = "transactions";

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
  source: z.literal("manual"),
  status: z.enum(["posted", "reversed", "reversal"]),
  idempotencyKey: z.string().uuid().optional(),
  reversalOf: z.unknown().optional(),
  reversedBy: z.unknown().optional(),
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
    session: MongoSession
  ): Promise<Transaction> {
    const now = new Date();
    const category =
      input.categoryId === undefined ? {} : { categoryId: new Types.ObjectId(input.categoryId) };
    const idempotency = idempotencyKey === undefined ? {} : { idempotencyKey };
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
      createdAt: now,
      updatedAt: now
    };
    const result = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .insertOne(document, { session });
    return this.toTransaction({ _id: result.insertedId, ...document });
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

  async findByReversalOf(userId: string, transactionId: string): Promise<Transaction | null> {
    const transaction = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .findOne({ userId, reversalOf: new Types.ObjectId(transactionId) });
    return transaction === null ? null : this.toTransaction(transaction);
  }

  async createReversal(
    userId: string,
    original: Transaction,
    session: MongoSession
  ): Promise<Transaction> {
    const now = new Date();
    const category =
      original.categoryId === undefined
        ? {}
        : { categoryId: new Types.ObjectId(original.categoryId) };
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
      createdAt: now,
      updatedAt: now
    };
    const result = await this.database()
      .collection(TRANSACTIONS_COLLECTION)
      .insertOne(document, { session });
    return this.toTransaction({ _id: result.insertedId, ...document });
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

function objectIdString(value: unknown): string {
  if (typeof value !== "object" || value === null || !("toString" in value)) {
    throw new Error("MongoDB document contains an invalid ObjectId.");
  }
  const stringify = value.toString;
  if (typeof stringify !== "function")
    throw new Error("MongoDB document contains an invalid ObjectId.");
  return stringify.call(value);
}
