import { transactionObserver } from "../logging/transaction-observer.service.js";
import type { DrizzleDb } from "./db.module.js";

type DbTransactionCallback = Parameters<DrizzleDb["transaction"]>[0];
export type DbTx = Parameters<DbTransactionCallback>[0];

const RETRYABLE_POSTGRES_ERROR_CODES = new Set(["40001", "40P01"]); // serialization_failure, deadlock_detected
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 10;

export async function withTxn<T>(db: DrizzleDb, operation: (tx: DbTx) => Promise<T>): Promise<T> {
  const observer = transactionObserver();
  const startedAt = performance.now();
  observer?.started();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      observer?.retried(attempt);
      await jitteredBackoff(attempt);
    }
    try {
      // Deliberately the Postgres default (read committed), not repeatable read/serializable.
      // Tried repeatable read first (to mirror the Mongo driver's `readConcern: "snapshot"`
      // intent) and it was wrong for this codebase's check-then-conditionally-write pattern
      // (e.g. idempotent archive: read idempotency record, then UPDATE ... WHERE is_archived
      // = false): under repeatable read, a transaction whose snapshot predates a concurrent
      // committed UPDATE to the same row deterministically raises 40001 the moment it tries
      // to touch that row -- no number of retries fixes it if enough concurrent writers keep
      // colliding with each other (verified empirically against a 5-way concurrent identical-
      // mutation test, Task 10). Read committed resolves the same race the simple way: the
      // second UPDATE blocks on the row lock, then re-evaluates its WHERE clause against the
      // just-committed data once unblocked -- "0 rows matched, already archived" instead of
      // an error. The retry loop below stays as a safety net for genuine transient failures
      // (deadlocks), not as the primary concurrency-control mechanism.
      const result = await db.transaction(operation);
      observer?.completed(performance.now() - startedAt);
      return result;
    } catch (error) {
      const code = postgresErrorCode(error);
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

function jitteredBackoff(attempt: number): Promise<void> {
  const delayMs = BASE_BACKOFF_MS * attempt + Math.random() * BASE_BACKOFF_MS;
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

// drizzle-orm wraps the driver's pg error in a DrizzleQueryError, with the
// real PostgresError (carrying `.code`) on `.cause` -- unwrap before giving up.
function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return postgresErrorCode(error.cause);
  return undefined;
}
