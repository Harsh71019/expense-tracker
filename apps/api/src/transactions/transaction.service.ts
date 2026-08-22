import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  type BatchCategorizeTransactions,
  type BatchCategorizeTransactionsResult,
  type CreateTransaction,
  type ListTransactionsQuery,
  type Transaction,
  type TransactionId,
  type TransactionInsights,
  type TransactionPage,
  type TransactionSource,
  type UpdateTransaction
} from "@treasury-ops/shared";
import { Logger } from "nestjs-pino";

import { AccountRepository } from "../accounts/account.repository.js";
import { assertBalanceDeltaApplied } from "../accounts/balance-delta.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { isUniqueViolation } from "../common/db/postgres-error.js";
import { CategoryKindMismatchError } from "../common/errors/category-kind-mismatch.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { TransferMetadataRequiresGroupError } from "../common/errors/transfer-metadata-requires-group.error.js";
import { LogEvent } from "../common/logging/events.js";
import { toISTMonth } from "../common/time/ist.js";
import { TransactionRepository } from "./transaction.repository.js";
import {
  TRANSACTION_CREATED_HOOK,
  type TransactionCreatedHook
} from "./transaction-created-hook.js";
import { reverseTransactionInTx } from "./reverse-transaction-in-tx.js";

export type CreateTransactionResult = Readonly<{ transaction: Transaction; replayed: boolean }>;
type TransactionLogger = Pick<Logger, "log" | "warn" | "error">;

@Injectable()
export class TransactionService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
    private readonly transactions: TransactionRepository,
    private readonly audit: AuditRepository,
    @Inject(Logger) private readonly logger: TransactionLogger,
    @Optional()
    @Inject(TRANSACTION_CREATED_HOOK)
    private readonly createdHook?: TransactionCreatedHook
  ) {}

  async create(
    userId: string,
    input: CreateTransaction,
    idempotencyKey: string | undefined,
    source: TransactionSource = "manual"
  ): Promise<CreateTransactionResult> {
    return this.createAndReplay(userId, input, idempotencyKey, source);
  }

  private async createAndReplay(
    userId: string,
    input: CreateTransaction,
    idempotencyKey: string | undefined,
    source: TransactionSource
  ): Promise<CreateTransactionResult> {
    try {
      const transaction = await withTxn(this.db, (tx) =>
        this.createInTx(
          userId,
          input,
          source,
          tx,
          idempotencyKey === undefined ? undefined : { idempotencyKey }
        )
      );
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

  /** Shared ledger-write core for composite mutations; it never opens a transaction itself. */
  async createInTx(
    userId: string,
    input: CreateTransaction,
    source: TransactionSource,
    tx: DbTx,
    options?: Readonly<{ idempotencyKey?: string }>
  ): Promise<Transaction> {
    if (input.categoryId !== undefined) {
      const category = await this.categories.findActiveById(userId, input.categoryId, tx);
      if (category === null) throw new EntityNotFoundError("Category");
      if (category.kind !== input.type) throw new CategoryKindMismatchError();
    }
    const deltaMinor = input.type === "income" ? input.amountMinor : -input.amountMinor;
    assertBalanceDeltaApplied(
      await this.accounts.applyBalanceDelta(userId, input.accountId, deltaMinor, tx)
    );
    const created = await this.transactions.create(
      userId,
      input,
      options?.idempotencyKey,
      tx,
      undefined,
      source
    );
    await this.audit.record(userId, "transaction.create", created.id, tx);
    if (source === "api") await this.createdHook?.onTransactionCreatedInTx(userId, created, tx);
    return created;
  }

  list(userId: string, query: ListTransactionsQuery): Promise<TransactionPage> {
    return this.transactions.findMany(userId, query);
  }

  getInsights(userId: string): Promise<TransactionInsights> {
    return this.transactions.getInsights(userId, toISTMonth(new Date()));
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

  async assignCategoryInTx(
    userId: string,
    input: BatchCategorizeTransactions,
    tx: DbTx
  ): Promise<BatchCategorizeTransactionsResult> {
    const category = await this.categories.findActiveById(userId, input.categoryId, tx);
    if (category === null) throw new EntityNotFoundError("Category");

    const before = await this.transactions.findByIds(userId, input.transactionIds, tx);
    if (before.length !== input.transactionIds.length) {
      throw new EntityNotFoundError("Transaction");
    }
    if (before.some((transaction) => transaction.transferGroupId !== undefined)) {
      throw new TransferMetadataRequiresGroupError();
    }
    if (before.some((transaction) => transaction.type !== category.kind)) {
      throw new CategoryKindMismatchError();
    }

    const updatedCount = await this.transactions.assignCategory(
      userId,
      input.transactionIds,
      input.categoryId,
      tx
    );
    if (updatedCount !== input.transactionIds.length) {
      throw new EntityNotFoundError("Transaction");
    }

    await this.audit.recordMany(
      userId,
      "transaction.update",
      before.map((transaction) => ({
        entityId: transaction.id,
        meta: {
          before: { categoryId: transaction.categoryId },
          after: { categoryId: input.categoryId },
          batch: true
        }
      })),
      tx
    );

    return {
      transactionIds: input.transactionIds,
      categoryId: input.categoryId,
      updatedCount
    };
  }

  async reverse(userId: string, transactionId: TransactionId): Promise<CreateTransactionResult> {
    try {
      const transaction = await withTxn(this.db, (tx) =>
        this.reverseInTx(userId, transactionId, tx)
      );
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

  /**
   * The `withTxn`-bound core of `reverse()` -- delegates to the shared
   * `reverseTransactionInTx` (see that file for why this is a plain function
   * rather than something the recurring reconciliation service calls
   * through this class).
   */
  reverseInTx(userId: string, transactionId: TransactionId, tx: DbTx): Promise<Transaction> {
    return reverseTransactionInTx(
      { transactions: this.transactions, accounts: this.accounts, audit: this.audit },
      userId,
      transactionId,
      tx
    );
  }
}
