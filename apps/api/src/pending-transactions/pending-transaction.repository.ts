import { Inject, Injectable } from "@nestjs/common";
import {
  StoredPendingTransactionSchema,
  type CreatePendingTransaction,
  type PendingTransactionId,
  type PendingTransactionStatus,
  type StoredPendingTransaction,
  type TransactionId
} from "@treasury-ops/shared";
import { and, desc, eq } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { pendingTransactions } from "../common/db/schema/index.js";
import { stripNulls } from "../common/db/strip-nulls.js";

@Injectable()
export class PendingTransactionRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    input: CreatePendingTransaction,
    tx: DbTx
  ): Promise<StoredPendingTransaction> {
    const now = new Date();
    const [row] = await tx
      .insert(pendingTransactions)
      .values({
        userId,
        accountId: input.accountId,
        type: input.type,
        occurredAt: input.occurredAt,
        description: input.description,
        status: "pending",
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Pending transaction insert did not return a row.");
    return toStoredPendingTransaction(row);
  }

  async findById(
    userId: string,
    id: PendingTransactionId,
    tx?: DbTx
  ): Promise<StoredPendingTransaction | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(pendingTransactions)
      .where(and(eq(pendingTransactions.id, id), eq(pendingTransactions.userId, userId)));
    return row === undefined ? null : toStoredPendingTransaction(row);
  }

  async list(
    userId: string,
    status: PendingTransactionStatus
  ): Promise<StoredPendingTransaction[]> {
    const rows = await this.db
      .select()
      .from(pendingTransactions)
      .where(and(eq(pendingTransactions.userId, userId), eq(pendingTransactions.status, status)))
      .orderBy(desc(pendingTransactions.createdAt));
    return rows.map(toStoredPendingTransaction);
  }

  async markConfirmed(
    userId: string,
    id: PendingTransactionId,
    resultingTransactionId: TransactionId,
    tx: DbTx
  ): Promise<StoredPendingTransaction | null> {
    const [row] = await tx
      .update(pendingTransactions)
      .set({ status: "confirmed", resultingTransactionId, updatedAt: new Date() })
      .where(
        and(
          eq(pendingTransactions.id, id),
          eq(pendingTransactions.userId, userId),
          eq(pendingTransactions.status, "pending")
        )
      )
      .returning();
    return row === undefined ? null : toStoredPendingTransaction(row);
  }

  async markDismissed(
    userId: string,
    id: PendingTransactionId,
    tx: DbTx
  ): Promise<StoredPendingTransaction | null> {
    const [row] = await tx
      .update(pendingTransactions)
      .set({ status: "dismissed", updatedAt: new Date() })
      .where(
        and(
          eq(pendingTransactions.id, id),
          eq(pendingTransactions.userId, userId),
          eq(pendingTransactions.status, "pending")
        )
      )
      .returning();
    return row === undefined ? null : toStoredPendingTransaction(row);
  }
}

function toStoredPendingTransaction(
  row: typeof pendingTransactions.$inferSelect
): StoredPendingTransaction {
  return StoredPendingTransactionSchema.parse(stripNulls(row));
}
