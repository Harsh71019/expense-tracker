import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../db/db.module.js";
import type { DrizzleDb } from "../db/db.module.js";
import { withTxn } from "../db/db-txn.js";
import type { DbTx } from "../db/db-txn.js";
import { IdempotencyConflictError } from "../errors/idempotency-conflict.error.js";
import { IdempotencyPostgresRepository } from "./idempotency-postgres.repository.js";

export type IdempotentResult<T> = Readonly<{ result: T; replayed: boolean }>;

const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

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
    requestIntent: unknown,
    resultSchema: z.ZodType<T>,
    work: (tx: DbTx) => Promise<T>
  ): Promise<IdempotentResult<T>> {
    const requestFingerprint = fingerprintRequest(requestIntent);
    await this.records.deleteExpired(userId, new Date(Date.now() - IDEMPOTENCY_RETENTION_MS));
    const existing = await this.records.find(userId, operation, key, resultSchema);
    if (existing !== null) return replay(existing, requestFingerprint);
    try {
      return await withTxn(this.db, async (tx) => {
        const concurrent = await this.records.find(userId, operation, key, resultSchema, tx);
        if (concurrent !== null) return replay(concurrent, requestFingerprint);
        const created = resultSchema.parse(await work(tx));
        await this.records.record(userId, operation, key, requestFingerprint, created, tx);
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
      const replay = await this.findCommittedReplay(
        userId,
        operation,
        key,
        requestFingerprint,
        resultSchema
      );
      if (replay === null) throw error;
      return replay;
    }
  }

  private async findCommittedReplay<T>(
    userId: string,
    operation: string,
    key: string,
    requestFingerprint: string,
    resultSchema: z.ZodType<T>
  ): Promise<IdempotentResult<T> | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await this.records.find(userId, operation, key, resultSchema);
      if (existing !== null) return replay(existing, requestFingerprint);
      await waitForCommit((attempt + 1) * 10);
    }
    return null;
  }
}

function replay<T>(
  existing: Readonly<{ requestFingerprint: string; result: T }>,
  requestFingerprint: string
): IdempotentResult<T> {
  if (existing.requestFingerprint !== requestFingerprint) {
    throw new IdempotencyConflictError();
  }
  return { result: existing.result, replayed: true };
}

export function fingerprintRequest(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (value instanceof Date) return `date:${value.toISOString()}`;

  switch (typeof value) {
    case "string":
      return `string:${JSON.stringify(value)}`;
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("Request intent numbers must be finite.");
      return `number:${Object.is(value, -0) ? "-0" : String(value)}`;
    case "boolean":
      return `boolean:${String(value)}`;
    case "undefined":
      return "undefined";
    case "object":
      if (Array.isArray(value)) {
        return `array:[${value.map((item) => canonicalize(item)).join(",")}]`;
      }
      return `object:{${Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
        .join(",")}}`;
    default:
      throw new TypeError(`Unsupported request intent value: ${typeof value}.`);
  }
}

function waitForCommit(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
