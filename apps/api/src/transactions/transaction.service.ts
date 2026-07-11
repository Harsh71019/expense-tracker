import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { type CreateTransaction, type Transaction } from "@vyaya/shared";
import type { Connection } from "mongoose";
import { z } from "zod";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { withTxn } from "../common/mongo-txn.js";
import { TransactionRepository } from "./transaction.repository.js";

export type CreateTransactionResult = Readonly<{ transaction: Transaction; replayed: boolean }>;

@Injectable()
export class TransactionService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
    private readonly transactions: TransactionRepository,
    private readonly audit: AuditRepository
  ) {}

  async create(
    userId: string,
    input: CreateTransaction,
    idempotencyKey: string | undefined
  ): Promise<CreateTransactionResult> {
    try {
      const transaction = await withTxn(this.connection, async (session) => {
        if (
          input.categoryId !== undefined &&
          !(await this.categories.exists(userId, input.categoryId, session))
        ) {
          throw new EntityNotFoundError("Category");
        }

        const deltaMinor = input.type === "income" ? input.amountMinor : -input.amountMinor;
        if (
          !(await this.accounts.applyBalanceDelta(userId, input.accountId, deltaMinor, session))
        ) {
          throw new EntityNotFoundError("Account");
        }

        const created = await this.transactions.create(userId, input, idempotencyKey, session);
        await this.audit.record(userId, "transaction.create", created.id, session);
        return created;
      });
      return { transaction, replayed: false };
    } catch (error) {
      if (idempotencyKey === undefined || !isDuplicateKeyError(error)) throw error;
      const transaction = await this.transactions.findByIdempotencyKey(userId, idempotencyKey);
      if (transaction === null) throw error;
      return { transaction, replayed: true };
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return z.object({ code: z.literal(11000) }).safeParse(error).success;
}
