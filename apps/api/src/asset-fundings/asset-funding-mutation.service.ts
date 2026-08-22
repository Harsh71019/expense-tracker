import { Injectable } from "@nestjs/common";
import {
  AssetFundingMutationResultSchema,
  ReverseAssetFundingResultSchema,
  type AssetFundingId,
  type AssetFundingMutationResult,
  type CreateInvestmentTransaction,
  type LinkTransactionToAsset,
  type ReverseAssetFundingResult,
  type TransactionId
} from "@treasury-ops/shared";

import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { AssetFundingService } from "./asset-funding.service.js";

@Injectable()
export class AssetFundingMutationService {
  constructor(
    private readonly idempotency: IdempotencyPostgresService,
    private readonly fundings: AssetFundingService
  ) {}

  link(
    userId: string,
    transactionId: TransactionId,
    input: LinkTransactionToAsset,
    key: string
  ): Promise<IdempotentResult<AssetFundingMutationResult>> {
    return this.idempotency.execute(
      userId,
      "asset-funding.link",
      key,
      { transactionId, input },
      AssetFundingMutationResultSchema,
      (tx) => this.fundings.linkInTx(userId, transactionId, input, tx)
    );
  }

  createInvestment(
    userId: string,
    input: CreateInvestmentTransaction,
    key: string
  ): Promise<IdempotentResult<AssetFundingMutationResult>> {
    return this.idempotency.execute(
      userId,
      "asset-funding.investment.create",
      key,
      input,
      AssetFundingMutationResultSchema,
      (tx) => this.fundings.createInvestmentInTx(userId, input, tx)
    );
  }

  reverse(
    userId: string,
    fundingId: AssetFundingId,
    key: string
  ): Promise<IdempotentResult<ReverseAssetFundingResult>> {
    return this.idempotency.execute(
      userId,
      "asset-funding.reverse",
      key,
      { fundingId },
      ReverseAssetFundingResultSchema,
      (tx) => this.fundings.reverseInTx(userId, fundingId, tx)
    );
  }
}
