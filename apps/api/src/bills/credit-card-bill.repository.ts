import { Inject, Injectable } from "@nestjs/common";
import {
  CreditCardBillSchema,
  type BillPage,
  type CreditCardBill,
  type CreditCardBillId,
  type ListBillsQuery
} from "@treasury-ops/shared";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { creditCardBills, transactions } from "../common/db/schema/index.js";
import type { DbTx } from "../common/db/db-txn.js";
import { decodeCursorPayload, encodeCursorPayload } from "../common/pagination/cursor.js";

const BillCursorSchema = z.object({ dueDate: z.string().datetime(), id: z.string().uuid() });

type NewBill = Readonly<{
  accountId: string;
  cycleStart: Date;
  cycleEnd: Date;
  dueDate: Date;
  amountDueMinor: number;
}>;

@Injectable()
export class CreditCardBillRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(userId: string, input: NewBill, tx: DbTx): Promise<CreditCardBill> {
    const now = new Date();
    const [row] = await tx
      .insert(creditCardBills)
      .values({
        userId,
        accountId: input.accountId,
        cycleStart: input.cycleStart,
        cycleEnd: input.cycleEnd,
        dueDate: input.dueDate,
        amountDueMinor: input.amountDueMinor,
        reconciliationStatus: "awaiting_statement",
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Credit-card bill insert did not return a row.");
    return toBill(row, 0);
  }

  async findById(
    userId: string,
    billId: CreditCardBillId,
    tx?: DbTx
  ): Promise<CreditCardBill | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(creditCardBills)
      .where(and(eq(creditCardBills.userId, userId), eq(creditCardBills.id, billId)));
    if (row === undefined) return null;
    const paid = await this.paidByBillIds(userId, [row.id], tx);
    return toBill(row, paid.get(row.id) ?? 0);
  }

  async findByIdForUpdate(
    userId: string,
    billId: CreditCardBillId,
    tx: DbTx
  ): Promise<CreditCardBill | null> {
    const [row] = await tx
      .select()
      .from(creditCardBills)
      .where(and(eq(creditCardBills.userId, userId), eq(creditCardBills.id, billId)))
      .for("update");
    if (row === undefined) return null;
    const paid = await this.paidByBillIds(userId, [row.id], tx);
    return toBill(row, paid.get(row.id) ?? 0);
  }

  async findMany(userId: string, query: ListBillsQuery): Promise<BillPage> {
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const conditions = [eq(creditCardBills.userId, userId)];
    if (query.accountId !== undefined) {
      conditions.push(eq(creditCardBills.accountId, query.accountId));
    }
    if (query.reconciliationStatus !== undefined) {
      conditions.push(eq(creditCardBills.reconciliationStatus, query.reconciliationStatus));
    }
    if (cursor !== null) {
      conditions.push(
        sql`(${creditCardBills.dueDate}, ${creditCardBills.id}) < (${cursor.dueDate}, ${cursor.id})`
      );
    }

    const rows = await this.db
      .select()
      .from(creditCardBills)
      .where(and(...conditions))
      .orderBy(desc(creditCardBills.dueDate), desc(creditCardBills.id));
    const paid = await this.paidByBillIds(
      userId,
      rows.map((row) => row.id)
    );
    const filtered = rows
      .map((row) => toBill(row, paid.get(row.id) ?? 0))
      .filter(
        (bill) => query.paymentStatus === undefined || bill.paymentStatus === query.paymentStatus
      );
    const page = filtered.slice(0, query.limit);
    const last = page.at(-1);
    const hasMore = filtered.length > query.limit;
    return {
      items: page,
      pageInfo: {
        nextCursor: hasMore && last !== undefined ? encodeCursor(last.dueDate, last.id) : null,
        hasMore,
        limit: query.limit
      }
    };
  }

  private async paidByBillIds(
    userId: string,
    billIds: readonly CreditCardBillId[],
    tx?: DbTx
  ): Promise<Map<CreditCardBillId, number>> {
    if (billIds.length === 0) return new Map();
    const executor = tx ?? this.db;
    const rows = await executor
      .select({
        billId: transactions.billId,
        total: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)`.mapWith(Number)
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(transactions.billId, [...billIds]),
          isNotNull(transactions.billId),
          eq(transactions.type, "income"),
          eq(transactions.status, "posted")
        )
      )
      .groupBy(transactions.billId);
    const paid = new Map<CreditCardBillId, number>();
    for (const row of rows) {
      if (row.billId !== null) paid.set(row.billId, row.total);
    }
    return paid;
  }

  async markReconciled(
    userId: string,
    billId: CreditCardBillId,
    tx: DbTx
  ): Promise<CreditCardBill | null> {
    const [row] = await tx
      .update(creditCardBills)
      .set({ reconciliationStatus: "reconciled", updatedAt: new Date() })
      .where(
        and(
          eq(creditCardBills.userId, userId),
          eq(creditCardBills.id, billId),
          eq(creditCardBills.reconciliationStatus, "awaiting_statement")
        )
      )
      .returning();
    if (row === undefined) return null;
    return toBill(row, 0);
  }
}

function toBill(row: typeof creditCardBills.$inferSelect, paidMinor: number): CreditCardBill {
  const remainingMinor = Math.max(0, row.amountDueMinor - paidMinor);
  const paymentStatus = remainingMinor === 0 ? "paid" : paidMinor === 0 ? "unpaid" : "partial";
  return CreditCardBillSchema.parse({
    ...row,
    paidMinor,
    remainingMinor,
    paymentStatus
  });
}

function encodeCursor(dueDate: Date, id: string): string {
  return encodeCursorPayload({ dueDate: dueDate.toISOString(), id });
}

function decodeCursor(cursor: string): z.infer<typeof BillCursorSchema> {
  return decodeCursorPayload(cursor, BillCursorSchema);
}
