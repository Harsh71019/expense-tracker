import { Inject, Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { type CreateTransaction, type Transaction, type TransactionId } from "@vyaya/shared";
import type { Connection } from "mongoose";
import { Logger } from "nestjs-pino";
import { z } from "zod";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { TransactionNotReversibleError } from "../common/errors/transaction-not-reversible.error.js";
import { withTxn } from "../common/mongo-txn.js";
import { LogEvent } from "../common/logging/events.js";
import { TransactionRepository } from "./transaction.repository.js";

export type CreateTransactionResult = Readonly<{ transaction: Transaction; replayed: boolean }>;
type TransactionLogger = Pick<Logger, "log" | "warn">;

@Injectable()
export class TransactionService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
    private readonly transactions: TransactionRepository,
    private readonly audit: AuditRepository,
    @Inject(Logger) private readonly logger: TransactionLogger
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
      this.logger.log(
        {
          event: LogEvent.TransactionCreated,
          txnId: transaction.id,
          accountId: transaction.accountId,
          amountMinor: transaction.amountMinor,
          type: transaction.type
        },
        "transaction created"
      );
      return { transaction, replayed: false };
    } catch (error) {
      if (idempotencyKey === undefined || !isDuplicateKeyError(error)) throw error;
      const transaction = await this.transactions.findByIdempotencyKey(userId, idempotencyKey);
      if (transaction === null) throw error;
      this.logger.warn(
        {
          event: LogEvent.IdempotencyDuplicate,
          key: idempotencyKey,
          originalTxnId: transaction.id
        },
        "idempotent replay served"
      );
      return { transaction, replayed: true };
    }
  }

  async reverse(userId: string, transactionId: TransactionId): Promise<CreateTransactionResult> {
    try {
      const transaction = await withTxn(this.connection, async (session) => {
        const original = await this.transactions.findPostedById(userId, transactionId, session);
        if (original === null) throw new TransactionNotReversibleError();

        const reversal = await this.transactions.createReversal(userId, original, session);
        if (!(await this.transactions.markReversed(userId, original.id, reversal.id, session))) {
          throw new TransactionNotReversibleError();
        }

        const deltaMinor =
          original.type === "expense" ? original.amountMinor : -original.amountMinor;
        if (
          !(await this.accounts.applyBalanceDelta(userId, original.accountId, deltaMinor, session))
        ) {
          throw new EntityNotFoundError("Account");
        }

        await this.audit.record(userId, "transaction.reverse", reversal.id, session);
        return reversal;
      });
      this.logger.log(
        {
          event: LogEvent.TransactionReversed,
          txnId: transaction.id,
          reversalOf: transaction.reversalOf
        },
        "transaction reversed"
      );
      return { transaction, replayed: false };
    } catch (error) {
      const reversal = await this.transactions.findByReversalOf(userId, transactionId);
      if (reversal === null) throw error;
      this.logger.warn(
        { event: LogEvent.IdempotencyDuplicate, originalTxnId: reversal.id },
        "reversal replay served"
      );
      return { transaction: reversal, replayed: true };
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return z.object({ code: z.literal(11000) }).safeParse(error).success;
}
