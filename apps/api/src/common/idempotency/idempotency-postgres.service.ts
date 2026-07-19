import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../db/db.module.js";
import type { DrizzleDb } from "../db/db.module.js";
import { withTxn } from "../db/db-txn.js";
import type { DbTx } from "../db/db-txn.js";
import { IdempotencyPostgresRepository } from "./idempotency-postgres.repository.js";

export type IdempotentResult<T> = Readonly<{ result: T; replayed: boolean }>;

/**
 * Postgres-backed counterpart to IdempotencyService, coexisting with it
 * until every mutation service that depends on it has been ported (see
 * Plans/2026-07-18-postgres-migration.md). Unlike the Mongo version,
 * `db` is constructor-injected rather than passed per-call -- there's
 * only ever one DrizzleDb provider, so threading it through every call
 * site added nothing the Mongo version's `connection` parameter did.
 */
@Injectable()
export class IdempotencyPostgresService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly records: IdempotencyPostgresRepository
  ) {}

  async execute<T>(
    userId: string,
    operation: string,
    key: string,
    resultSchema: z.ZodType<T>,
    work: (tx: DbTx) => Promise<T>
  ): Promise<IdempotentResult<T>> {
    const existing = await this.records.find(userId, operation, key, resultSchema);
    if (existing !== null) return { result: existing.result, replayed: true };
    try {
      return await withTxn(this.db, async (tx) => {
        const concurrent = await this.records.find(userId, operation, key, resultSchema, tx);
        if (concurrent !== null) return { result: concurrent.result, replayed: true };
        const created = resultSchema.parse(await work(tx));
        await this.records.record(userId, operation, key, created, tx);
        return { result: created, replayed: false };
      });
    } catch (error) {
      // Under read committed (see db-txn.ts), a losing concurrent request's `work(tx)`
      // can fail for reasons other than a unique violation on the idempotency key itself
      // -- e.g. an idempotent archive's UPDATE blocks on the winner's row lock, then
      // unblocks to find the row already archived and 0 rows matched, surfacing as
      // whatever "not found" error the domain operation raises for that case. Any
      // failure here might just mean a concurrent identical request already finished,
      // not a genuine error -- always check for that before propagating.
      const replay = await this.findCommittedReplay(userId, operation, key, resultSchema);
      if (replay === null) throw error;
      return { result: replay.result, replayed: true };
    }
  }

  private async findCommittedReplay<T>(
    userId: string,
    operation: string,
    key: string,
    resultSchema: z.ZodType<T>
  ): Promise<Readonly<{ result: T }> | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const replay = await this.records.find(userId, operation, key, resultSchema);
      if (replay !== null) return replay;
      await waitForCommit((attempt + 1) * 10);
    }
    return null;
  }
}

function waitForCommit(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
