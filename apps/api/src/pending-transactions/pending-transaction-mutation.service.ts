import { Injectable } from "@nestjs/common";
import {
  PendingTransactionSchema,
  type CreatePendingTransaction,
  type PendingTransaction,
  type PendingTransactionId
} from "@treasury-ops/shared";

import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { PendingTransactionService } from "./pending-transaction.service.js";

@Injectable()
export class PendingTransactionMutationService {
  constructor(
    private readonly pending: PendingTransactionService,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  create(
    userId: string,
    input: CreatePendingTransaction,
    key: string
  ): Promise<IdempotentResult<PendingTransaction>> {
    return this.idempotency.execute(
      userId,
      "pending_transaction.create",
      key,
      input,
      PendingTransactionSchema,
      (tx) => this.pending.createInTx(userId, input, tx)
    );
  }

  dismiss(
    userId: string,
    id: PendingTransactionId,
    key: string
  ): Promise<IdempotentResult<PendingTransaction>> {
    return this.idempotency.execute(
      userId,
      "pending_transaction.dismiss",
      key,
      { id },
      PendingTransactionSchema,
      (tx) => this.pending.dismissInTx(userId, id, tx)
    );
  }
}
