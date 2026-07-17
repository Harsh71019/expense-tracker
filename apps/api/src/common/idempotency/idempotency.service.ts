import { Injectable } from "@nestjs/common";
import type { Connection } from "mongoose";
import { z } from "zod";

import { withTxn, type MongoSession } from "../mongo-txn.js";
import { IdempotencyRepository } from "./idempotency.repository.js";

export type IdempotentResult<T> = Readonly<{ result: T; replayed: boolean }>;

@Injectable()
export class IdempotencyService {
  constructor(private readonly records: IdempotencyRepository) {}

  async execute<T>(
    connection: Connection,
    userId: string,
    operation: string,
    key: string,
    resultSchema: z.ZodType<T>,
    work: (session: MongoSession) => Promise<T>
  ): Promise<IdempotentResult<T>> {
    const existing = await this.records.find(userId, operation, key, resultSchema);
    if (existing !== null) return { result: existing.result, replayed: true };
    try {
      const result = await withTxn(connection, async (session) => {
        const concurrent = await this.records.find(userId, operation, key, resultSchema, session);
        if (concurrent !== null) return { result: concurrent.result, replayed: true };
        const created = resultSchema.parse(await work(session));
        await this.records.record(userId, operation, key, created, session);
        return { result: created, replayed: false };
      });
      return result;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
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

function isDuplicateKeyError(error: unknown): boolean {
  return z.object({ code: z.literal(11000) }).safeParse(error).success;
}

function waitForCommit(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
