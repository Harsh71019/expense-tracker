import { transactionObserver } from "../logging/transaction-observer.service.js";
import type { DrizzleDb } from "./db.module.js";

type DbTransactionCallback = Parameters<DrizzleDb["transaction"]>[0];
export type DbTx = Parameters<DbTransactionCallback>[0];

const RETRYABLE_POSTGRES_ERROR_CODES = new Set(["40001", "40P01"]); // serialization_failure, deadlock_detected
const MAX_ATTEMPTS = 3;

export async function withTxn<T>(db: DrizzleDb, operation: (tx: DbTx) => Promise<T>): Promise<T> {
  const observer = transactionObserver();
  const startedAt = performance.now();
  observer?.started();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) observer?.retried(attempt);
    try {
      // repeatable read: matches the Mongo driver's `readConcern: "snapshot"` intent --
      // every statement in the transaction sees one consistent snapshot.
      const result = await db.transaction(operation, { isolationLevel: "repeatable read" });
      observer?.completed(performance.now() - startedAt);
      return result;
    } catch (error) {
      const code = isPostgresError(error) ? error.code : undefined;
      if (
        code !== undefined &&
        RETRYABLE_POSTGRES_ERROR_CODES.has(code) &&
        attempt < MAX_ATTEMPTS
      ) {
        continue;
      }
      observer?.failed(error, performance.now() - startedAt);
      throw error;
    }
  }
  throw new Error("unreachable: retry loop exited without returning or throwing");
}

function isPostgresError(error: unknown): error is { code: string } {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return typeof error.code === "string";
}
