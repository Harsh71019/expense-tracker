import { Injectable } from "@nestjs/common";
import {
  TransactionSchema,
  type Transaction,
  type TransactionId,
  type UpdateTransaction
} from "@vyaya/shared";

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
      TransactionSchema,
      (tx) => this.transactions.updateInTx(userId, transactionId, patch, tx)
    );
  }
}
