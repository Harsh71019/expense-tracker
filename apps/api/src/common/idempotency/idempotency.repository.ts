import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { z } from "zod";

import type { MongoSession } from "../mongo-txn.js";

const COLLECTION = "idempotency_records";

const StoredIdempotencyRecordSchema = z.object({
  userId: z.string().min(1),
  operation: z.string().min(1),
  key: z.string().uuid(),
  result: z.unknown(),
  createdAt: z.date()
});

type IdempotencyRecord<T> = Readonly<{ result: T }>;

@Injectable()
export class IdempotencyRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async find<T>(
    userId: string,
    operation: string,
    key: string,
    resultSchema: z.ZodType<T>,
    session?: MongoSession
  ): Promise<IdempotencyRecord<T> | null> {
    const value = await this.database()
      .collection<IdempotencyRecord<T>>(COLLECTION)
      .findOne({ userId, operation, key }, session === undefined ? {} : { session });
    if (value === null) return null;

    const record = StoredIdempotencyRecordSchema.parse(value);
    return { result: resultSchema.parse(record.result) };
  }

  async record<T>(
    userId: string,
    operation: string,
    key: string,
    result: T,
    session: MongoSession
  ): Promise<void> {
    const record = StoredIdempotencyRecordSchema.parse({
      userId,
      operation,
      key,
      result,
      createdAt: new Date()
    });
    await this.database().collection(COLLECTION).insertOne(record, { session });
  }

  private database(): NonNullable<Connection["db"]> {
    const database = this.connection.db;
    if (database === undefined) throw new Error("MongoDB connection is not ready");
    return database;
  }
}
