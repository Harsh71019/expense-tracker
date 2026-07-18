import { Inject, Injectable } from "@nestjs/common";
import { AccountSchema, type Account, type AccountId, type CreateAccount } from "@vyaya/shared";
import { and, eq, sql } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { accounts } from "../common/db/schema/index.js";
import type { DbTx } from "../common/db/db-txn.js";

@Injectable()
export class AccountRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(userId: string, input: CreateAccount, tx: DbTx): Promise<Account> {
    const now = new Date();
    const [row] = await tx
      .insert(accounts)
      .values({
        userId,
        name: input.name,
        type: input.type,
        currency: "INR",
        openingBalanceMinor: input.openingBalanceMinor,
        balanceMinor: input.openingBalanceMinor,
        isArchived: false,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Account insert did not return a row.");
    return AccountSchema.parse(row);
  }

  async list(userId: string): Promise<Account[]> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)))
      .orderBy(accounts.name);
    return rows.map((row) => AccountSchema.parse(row));
  }

  async archive(userId: string, accountId: AccountId, tx?: DbTx): Promise<boolean> {
    const executor = tx ?? this.db;
    const rows = await executor
      .update(accounts)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(
        and(eq(accounts.id, accountId), eq(accounts.userId, userId), eq(accounts.isArchived, false))
      )
      .returning({ id: accounts.id });
    return rows.length === 1;
  }

  async exists(userId: string, accountId: AccountId, tx?: DbTx): Promise<boolean> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(eq(accounts.id, accountId), eq(accounts.userId, userId), eq(accounts.isArchived, false))
      );
    return rows.length > 0;
  }

  async applyBalanceDelta(
    userId: string,
    accountId: AccountId,
    deltaMinor: number,
    tx: DbTx
  ): Promise<boolean> {
    const rows = await tx
      .update(accounts)
      .set({ balanceMinor: sql`${accounts.balanceMinor} + ${deltaMinor}`, updatedAt: new Date() })
      .where(
        and(eq(accounts.id, accountId), eq(accounts.userId, userId), eq(accounts.isArchived, false))
      )
      .returning({ id: accounts.id });
    return rows.length === 1;
  }
}
