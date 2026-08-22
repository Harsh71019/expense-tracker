import { Injectable } from "@nestjs/common";
import {
  ReceivableMutationResultSchema,
  ReceivableSchema,
  type CreateReceivable,
  type CreateReceivableCorrection,
  type Receivable,
  type ReceivableId,
  type ReceivableMutationResult,
  type RecordReceivableRepayment,
  type UpdateReceivableMetadata
} from "@treasury-ops/shared";

import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { ReceivableService } from "./receivable.service.js";

@Injectable()
export class ReceivableMutationService {
  constructor(
    private readonly receivables: ReceivableService,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  create(
    userId: string,
    input: CreateReceivable,
    key: string
  ): Promise<IdempotentResult<ReceivableMutationResult>> {
    return this.idempotency.execute(
      userId,
      "receivable.create",
      key,
      input,
      ReceivableMutationResultSchema,
      (tx) => this.receivables.createInTx(userId, input, tx)
    );
  }

  updateMetadata(
    userId: string,
    receivableId: ReceivableId,
    patch: UpdateReceivableMetadata,
    key: string
  ): Promise<IdempotentResult<Receivable>> {
    return this.idempotency.execute(
      userId,
      "receivable.metadata.update",
      key,
      { receivableId, patch },
      ReceivableSchema,
      (tx) => this.receivables.updateMetadataInTx(userId, receivableId, patch, tx)
    );
  }

  recordRepayment(
    userId: string,
    receivableId: ReceivableId,
    input: RecordReceivableRepayment,
    key: string
  ): Promise<IdempotentResult<ReceivableMutationResult>> {
    return this.idempotency.execute(
      userId,
      "receivable.repayment.create",
      key,
      { receivableId, input },
      ReceivableMutationResultSchema,
      (tx) => this.receivables.recordRepaymentInTx(userId, receivableId, input, tx)
    );
  }

  createCorrection(
    userId: string,
    receivableId: ReceivableId,
    input: CreateReceivableCorrection,
    key: string
  ): Promise<IdempotentResult<ReceivableMutationResult>> {
    return this.idempotency.execute(
      userId,
      "receivable.correction.create",
      key,
      { receivableId, input },
      ReceivableMutationResultSchema,
      (tx) => this.receivables.createCorrectionInTx(userId, receivableId, input, tx)
    );
  }
}
