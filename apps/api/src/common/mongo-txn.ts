import type { Connection } from "mongoose";

import { transactionObserver } from "./logging/transaction-observer.service.js";

export type MongoSession = Awaited<ReturnType<Connection["startSession"]>>;

const transactionOptions = {
  readConcern: { level: "snapshot" as const },
  writeConcern: { w: "majority" as const }
};

export async function withTxn<T>(
  connection: Connection,
  operation: (session: MongoSession) => Promise<T>
): Promise<T> {
  const session = await connection.startSession();
  const observer = transactionObserver();
  const startedAt = performance.now();
  let attempts = 0;
  observer?.started();
  try {
    const result = await session.withTransaction(async (activeSession) => {
      attempts += 1;
      if (attempts > 1) {
        observer?.retried(attempts);
      }
      return operation(activeSession);
    }, transactionOptions);
    observer?.completed(performance.now() - startedAt);
    return result;
  } catch (error) {
    observer?.failed(error, performance.now() - startedAt);
    throw error;
  } finally {
    await session.endSession();
  }
}
