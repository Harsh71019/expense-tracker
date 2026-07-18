import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  TransactionSchema,
  type Transaction,
  type TransactionId,
  type UpdateTransaction
} from "@vyaya/shared";
import type { Connection } from "mongoose";

import {
  IdempotencyService,
  type IdempotentResult
} from "../common/idempotency/idempotency.service.js";
import { TransactionService } from "./transaction.service.js";

@Injectable()
export class TransactionMutationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly transactions: TransactionService,
    private readonly idempotency: IdempotencyService
  ) {}

  update(
    userId: string,
    transactionId: TransactionId,
    patch: UpdateTransaction,
    key: string
  ): Promise<IdempotentResult<Transaction>> {
    return this.idempotency.execute(
      this.connection,
      userId,
      "transaction.metadata.update",
      key,
      TransactionSchema,
      (session) => this.transactions.updateInSession(userId, transactionId, patch, session)
    );
  }
}
