import { Inject, Injectable } from "@nestjs/common";
import {
  AccountSchema,
  type Account,
  type AccountId,
  type CreateAccount,
  type CreditCardConfigInput
} from "@treasury-ops/shared";
import { and, eq, lte, sql } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { accounts } from "../common/db/schema/index.js";
import type { DbTx } from "../common/db/db-txn.js";

@Injectable()
export class AccountRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(
    userId: string,
    input: CreateAccount,
    tx: DbTx,
    nextStatementAt?: Date
  ): Promise<Account> {
    const now = new Date();
    const config = input.creditCardConfig;
    if (config !== undefined && nextStatementAt === undefined) {
      throw new Error("Configured credit-card accounts require a precomputed statement date.");
    }
    const [row] = await tx
      .insert(accounts)
      .values({
        userId,
        name: input.name,
        type: input.type,
        currency: "INR",
        openingBalanceMinor: input.openingBalanceMinor,
        balanceMinor: input.openingBalanceMinor,
        statementDay: config?.statementDay ?? null,
        dueDay: config?.dueDay ?? null,
        nextStatementAt: nextStatementAt ?? null,
        isArchived: false,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (row === undefined) throw new Error("Account insert did not return a row.");
    return toAccount(row);
  }

  async list(userId: string): Promise<Account[]> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)))
      .orderBy(accounts.name);
    return rows.map(toAccount);
  }

  async findActiveById(userId: string, accountId: AccountId, tx?: DbTx): Promise<Account | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.id, accountId), eq(accounts.userId, userId), eq(accounts.isArchived, false))
      );
    return row === undefined ? null : toAccount(row);
  }

  async findById(userId: string, accountId: AccountId, tx?: DbTx): Promise<Account | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
    return row === undefined ? null : toAccount(row);
  }

  async updateCreditCardConfig(
    userId: string,
    accountId: AccountId,
    config: CreditCardConfigInput,
    nextStatementAt: Date,
    tx: DbTx
  ): Promise<Account | null> {
    const [row] = await tx
      .update(accounts)
      .set({
        statementDay: config.statementDay,
        dueDay: config.dueDay,
        nextStatementAt,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(accounts.id, accountId),
          eq(accounts.userId, userId),
          eq(accounts.type, "credit_card"),
          eq(accounts.isArchived, false)
        )
      )
      .returning();
    return row === undefined ? null : toAccount(row);
  }

  /**
   * Global scheduled sweep, mirroring RecurringRuleRepository.findDue. The
   * returned rows include userId, and every claim/read/write after discovery
   * is scoped to that owner.
   */
  async findDueCreditCards(asOf: Date): Promise<Account[]> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.type, "credit_card"),
          eq(accounts.isArchived, false),
          lte(accounts.nextStatementAt, asOf)
        )
      );
    return rows.map(toAccount);
  }

  async claimStatementCycle(
    userId: string,
    accountId: AccountId,
    expectedNextStatementAt: Date,
    nextStatementAt: Date,
    tx: DbTx
  ): Promise<boolean> {
    const rows = await tx
      .update(accounts)
      .set({ nextStatementAt, updatedAt: new Date() })
      .where(
        and(
          eq(accounts.id, accountId),
          eq(accounts.userId, userId),
          eq(accounts.type, "credit_card"),
          eq(accounts.isArchived, false),
          eq(accounts.nextStatementAt, expectedNextStatementAt)
        )
      )
      .returning({ id: accounts.id });
    return rows.length === 1;
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

  /**
   * Reversals must remain possible after an account is archived. This is
   * deliberately separate from applyBalanceDelta so ordinary creates,
   * transfers, imports, and recurring posts cannot write new activity to an
   * archived account.
   */
  async applyReversalBalanceDelta(
    userId: string,
    accountId: AccountId,
    deltaMinor: number,
    tx: DbTx
  ): Promise<boolean> {
    const rows = await tx
      .update(accounts)
      .set({ balanceMinor: sql`${accounts.balanceMinor} + ${deltaMinor}`, updatedAt: new Date() })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .returning({ id: accounts.id });
    return rows.length === 1;
  }
}

function toAccount(row: typeof accounts.$inferSelect): Account {
  const creditCardConfig =
    row.statementDay === null || row.dueDay === null || row.nextStatementAt === null
      ? undefined
      : {
          statementDay: row.statementDay,
          dueDay: row.dueDay,
          nextStatementAt: row.nextStatementAt
        };
  return AccountSchema.parse({
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    currency: row.currency,
    openingBalanceMinor: row.openingBalanceMinor,
    balanceMinor: row.balanceMinor,
    ...(creditCardConfig === undefined ? {} : { creditCardConfig }),
    isArchived: row.isArchived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}
