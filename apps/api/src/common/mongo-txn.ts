import type { Connection } from "mongoose";

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
  try {
    return await session.withTransaction(operation, transactionOptions);
  } finally {
    await session.endSession();
  }
}
