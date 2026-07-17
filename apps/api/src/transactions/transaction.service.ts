import { Inject, Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  type CreateTransaction,
  type ListTransactionsQuery,
  type Transaction,
  type TransactionId,
  type TransactionPage,
  type UpdateTransaction
} from "@vyaya/shared";
import type { Connection } from "mongoose";
import { Logger } from "nestjs-pino";
import { z } from "zod";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { TransactionNotReversibleError } from "../common/errors/transaction-not-reversible.error.js";
import { TransferMetadataRequiresGroupError } from "../common/errors/transfer-metadata-requires-group.error.js";
import { withTxn, type MongoSession } from "../common/mongo-txn.js";
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

  list(userId: string, query: ListTransactionsQuery): Promise<TransactionPage> {
    return this.transactions.findMany(userId, query);
  }

  async get(userId: string, transactionId: TransactionId): Promise<Transaction> {
    const transaction = await this.transactions.findById(userId, transactionId);
    if (transaction === null) throw new EntityNotFoundError("Transaction");
    return transaction;
  }

  async update(
    userId: string,
    transactionId: TransactionId,
    patch: UpdateTransaction
  ): Promise<Transaction> {
    const updated = await withTxn(this.connection, (session) =>
      this.updateInSession(userId, transactionId, patch, session)
    );

    this.logger.log(
      { event: LogEvent.TransactionUpdated, txnId: updated.id },
      "transaction updated"
    );
    return updated;
  }

  async updateInSession(
    userId: string,
    transactionId: TransactionId,
    patch: UpdateTransaction,
    session: MongoSession
  ): Promise<Transaction> {
    const before = await this.transactions.findById(userId, transactionId, session);
    if (before === null) throw new EntityNotFoundError("Transaction");
    if (before.transferGroupId !== undefined) throw new TransferMetadataRequiresGroupError();

    if (
      patch.categoryId !== undefined &&
      patch.categoryId !== null &&
      !(await this.categories.exists(userId, patch.categoryId, session))
    ) {
      throw new EntityNotFoundError("Category");
    }

    const after = await this.transactions.updateNonMonetaryFields(
      userId,
      transactionId,
      patch,
      session
    );
    if (after === null) throw new EntityNotFoundError("Transaction");

    await this.audit.record(userId, "transaction.update", after.id, session, {
      before: {
        description: before.description,
        tags: before.tags,
        categoryId: before.categoryId
      },
      after: { description: after.description, tags: after.tags, categoryId: after.categoryId }
    });

    return after;
  }

  async reverse(userId: string, transactionId: TransactionId): Promise<CreateTransactionResult> {
    try {
      const transaction = await withTxn(this.connection, async (session) => {
        const original = await this.transactions.findPostedById(userId, transactionId, session);
        if (original === null) {
          const existing = await this.transactions.findById(userId, transactionId, session);
          if (existing === null) throw new EntityNotFoundError("Transaction");
          throw new TransactionNotReversibleError();
        }

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
