import { Inject, Injectable } from "@nestjs/common";
import {
  type CreateTransaction,
  type ListTransactionsQuery,
  type Transaction,
  type TransactionId,
  type TransactionPage,
  type UpdateTransaction
} from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { AccountRepository } from "../accounts/account.repository.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { CategoryKindMismatchError } from "../common/errors/category-kind-mismatch.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { TransactionNotReversibleError } from "../common/errors/transaction-not-reversible.error.js";
import { TransferMetadataRequiresGroupError } from "../common/errors/transfer-metadata-requires-group.error.js";
import { LogEvent } from "../common/logging/events.js";
import { TransactionRepository } from "./transaction.repository.js";

export type CreateTransactionResult = Readonly<{ transaction: Transaction; replayed: boolean }>;
type TransactionLogger = Pick<Logger, "log" | "warn">;

@Injectable()
export class TransactionService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
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
      const transaction = await withTxn(this.db, async (tx) => {
        if (input.categoryId !== undefined) {
          const category = await this.categories.findActiveById(userId, input.categoryId, tx);
          if (category === null) throw new EntityNotFoundError("Category");
          if (category.kind !== input.type) throw new CategoryKindMismatchError();
        }

        const deltaMinor = input.type === "income" ? input.amountMinor : -input.amountMinor;
        if (!(await this.accounts.applyBalanceDelta(userId, input.accountId, deltaMinor, tx))) {
          throw new EntityNotFoundError("Account");
        }

        const created = await this.transactions.create(userId, input, idempotencyKey, tx);
        await this.audit.record(userId, "transaction.create", created.id, tx);
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
      if (idempotencyKey === undefined || !isUniqueViolation(error)) throw error;
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
    const updated = await withTxn(this.db, (tx) =>
      this.updateInTx(userId, transactionId, patch, tx)
    );

    this.logger.log(
      { event: LogEvent.TransactionUpdated, txnId: updated.id },
      "transaction updated"
    );
    return updated;
  }

  async updateInTx(
    userId: string,
    transactionId: TransactionId,
    patch: UpdateTransaction,
    tx: DbTx
  ): Promise<Transaction> {
    const before = await this.transactions.findById(userId, transactionId, tx);
    if (before === null) throw new EntityNotFoundError("Transaction");
    if (before.transferGroupId !== undefined) throw new TransferMetadataRequiresGroupError();

    if (patch.categoryId !== undefined && patch.categoryId !== null) {
      const category = await this.categories.findActiveById(userId, patch.categoryId, tx);
      if (category === null) throw new EntityNotFoundError("Category");
      if (category.kind !== before.type) throw new CategoryKindMismatchError();
    }

    const after = await this.transactions.updateNonMonetaryFields(userId, transactionId, patch, tx);
    if (after === null) throw new EntityNotFoundError("Transaction");

    await this.audit.record(userId, "transaction.update", after.id, tx, {
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
      const transaction = await withTxn(this.db, async (tx) => {
        const original = await this.transactions.findPostedById(userId, transactionId, tx);
        if (original === null) {
          const existing = await this.transactions.findById(userId, transactionId, tx);
          if (existing === null) throw new EntityNotFoundError("Transaction");
          throw new TransactionNotReversibleError();
        }

        const reversal = await this.transactions.createReversal(userId, original, tx);
        if (!(await this.transactions.markReversed(userId, original.id, reversal.id, tx))) {
          throw new TransactionNotReversibleError();
        }

        const deltaMinor =
          original.type === "expense" ? original.amountMinor : -original.amountMinor;
        if (
          !(await this.accounts.applyReversalBalanceDelta(
            userId,
            original.accountId,
            deltaMinor,
            tx
          ))
        ) {
          throw new EntityNotFoundError("Account");
        }

        await this.audit.record(userId, "transaction.reverse", reversal.id, tx);
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

export function isUniqueViolation(error: unknown): boolean {
  // drizzle-orm wraps the driver's pg error in a DrizzleQueryError, with the
  // real PostgresError (carrying `.code`) on `.cause` -- unwrap one level
  // before giving up, mirroring how Node's own `cause` chaining works.
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  if ("cause" in error) return isUniqueViolation(error.cause);
  return false;
}
