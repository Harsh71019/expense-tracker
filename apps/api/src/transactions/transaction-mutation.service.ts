import { Injectable } from "@nestjs/common";
import {
  BatchCategorizeTransactionsResultSchema,
  TransactionSchema,
  type BatchCategorizeTransactions,
  type BatchCategorizeTransactionsResult,
  type Transaction,
  type TransactionId,
  type UpdateTransaction
} from "@treasury-ops/shared";

import { IdempotencyPostgresService } from "../common/idempotency/idempotency-postgres.service.js";
import type { IdempotentResult } from "../common/idempotency/idempotency-postgres.service.js";
import { TransactionService } from "./transaction.service.js";

@Injectable()
export class TransactionMutationService {
  constructor(
    private readonly transactions: TransactionService,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  update(
    userId: string,
    transactionId: TransactionId,
    patch: UpdateTransaction,
    key: string
  ): Promise<IdempotentResult<Transaction>> {
    return this.idempotency.execute(
      userId,
      "transaction.metadata.update",
      key,
      { transactionId, patch },
      TransactionSchema,
      (tx) => this.transactions.updateInTx(userId, transactionId, patch, tx)
    );
  }

  assignCategory(
    userId: string,
    input: BatchCategorizeTransactions,
    key: string
  ): Promise<IdempotentResult<BatchCategorizeTransactionsResult>> {
    return this.idempotency.execute(
      userId,
      "transaction.category.batch-assign",
      key,
      input,
      BatchCategorizeTransactionsResultSchema,
      (tx) => this.transactions.assignCategoryInTx(userId, input, tx)
    );
  }
}
