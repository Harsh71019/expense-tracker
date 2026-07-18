import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../db/db.module.js";
import type { DrizzleDb } from "../db/db.module.js";
import { idempotencyRecords } from "../db/schema/index.js";
import type { DbTx } from "../db/db-txn.js";

type IdempotencyRecord<T> = Readonly<{ result: T }>;

/**
 * Postgres-backed idempotency records, coexisting with the Mongo
 * IdempotencyRepository until every mutation service that depends on it
 * has been ported (see Plans/2026-07-18-postgres-migration.md) --
 * idempotency records must be written atomically with the domain write
 * they guard, which is only possible when both live in the same
 * database. Renamed to replace idempotency.repository.ts once nothing
 * references the Mongo version anymore.
 */
@Injectable()
export class IdempotencyPostgresRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async find<T>(
    userId: string,
    operation: string,
    key: string,
    resultSchema: z.ZodType<T>,
    tx?: DbTx
  ): Promise<IdempotencyRecord<T> | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.userId, userId),
          eq(idempotencyRecords.operation, operation),
          eq(idempotencyRecords.key, key)
        )
      );
    if (row === undefined) return null;
    return { result: resultSchema.parse(row.result) };
  }

  async record<T>(
    userId: string,
    operation: string,
    key: string,
    result: T,
    tx: DbTx
  ): Promise<void> {
    await tx
      .insert(idempotencyRecords)
      .values({ userId, operation, key, result, createdAt: new Date() });
  }
}
