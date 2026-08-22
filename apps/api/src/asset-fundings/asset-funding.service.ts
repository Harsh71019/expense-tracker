import { Injectable } from "@nestjs/common";
import {
  AssetFundingMutationResultSchema,
  ReverseAssetFundingResultSchema,
  type Asset,
  type AssetFundingMutationResult,
  type AssetFundingTarget,
  type CreateInvestmentTransaction,
  type LinkTransactionToAsset,
  type ReverseAssetFundingResult,
  type Transaction,
  type TransactionId
} from "@treasury-ops/shared";

import { AssetRepository } from "../assets/asset.repository.js";
import { AssetService } from "../assets/asset.service.js";
import type { DbTx } from "../common/db/db-txn.js";
import {
  AssetFundingAlreadyLinkedError,
  AssetFundingAssetUnavailableError,
  AssetFundingNotReversibleError,
  AssetFundingSourceNotEligibleError
} from "../common/errors/asset-funding.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { toISTMonth } from "../common/time/ist.js";
import { MonthlyRollupRepository } from "../reports/monthly-rollup.repository.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { TransactionService } from "../transactions/transaction.service.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { AssetFundingRepository } from "./asset-funding.repository.js";
import type { TransactionReversalHook } from "../transactions/transaction-reversal-hook.js";

@Injectable()
export class AssetFundingService implements TransactionReversalHook {
  constructor(
    private readonly fundings: AssetFundingRepository,
    private readonly transactions: TransactionRepository,
    private readonly transactionService: TransactionService,
    private readonly assets: AssetRepository,
    private readonly assetService: AssetService,
    private readonly rollups: MonthlyRollupRepository,
    private readonly audit: AuditRepository
  ) {}

  async linkInTx(
    userId: string,
    transactionId: TransactionId,
    input: LinkTransactionToAsset,
    tx: DbTx
  ): Promise<AssetFundingMutationResult> {
    const transaction = await this.transactions.findPostedByIdForUpdate(userId, transactionId, tx);
    if (transaction === null) throw new EntityNotFoundError("Transaction");
    this.assertEligible(transaction);
    if ((await this.fundings.findActiveByTransactionId(userId, transaction.id, tx)) !== null) {
      throw new AssetFundingAlreadyLinkedError();
    }
    const asset = await this.resolveTarget(userId, input.target, transaction, tx);
    const funding = await this.fundings.create(
      userId,
      {
        assetId: asset.id,
        transactionId: transaction.id,
        amountMinor: transaction.amountMinor,
        occurredAt: transaction.occurredAt
      },
      tx
    );
    await this.audit.record(userId, "asset_funding.create", funding.id, tx, {
      assetId: asset.id,
      transactionId: transaction.id
    });
    await this.rollups.invalidate(userId, toISTMonth(transaction.occurredAt), tx);
    return AssetFundingMutationResultSchema.parse({ funding, transaction, asset });
  }

  async createInvestmentInTx(
    userId: string,
    input: CreateInvestmentTransaction,
    tx: DbTx
  ): Promise<AssetFundingMutationResult> {
    const occurredAt = new Date(input.occurredAt);
    const transaction = await this.transactionService.createInTx(
      userId,
      {
        accountId: input.accountId,
        amountMinor: input.amountMinor,
        occurredAt,
        description: input.description,
        tags: input.tags,
        type: "expense"
      },
      "manual",
      tx
    );
    const asset = await this.resolveTarget(userId, input.target, transaction, tx);
    const funding = await this.fundings.create(
      userId,
      {
        assetId: asset.id,
        transactionId: transaction.id,
        amountMinor: transaction.amountMinor,
        occurredAt: transaction.occurredAt
      },
      tx
    );
    await this.audit.record(userId, "asset_funding.create", funding.id, tx, {
      assetId: asset.id,
      transactionId: transaction.id
    });
    await this.rollups.invalidate(userId, toISTMonth(transaction.occurredAt), tx);
    return AssetFundingMutationResultSchema.parse({ funding, transaction, asset });
  }

  async reverseInTx(
    userId: string,
    fundingId: string,
    tx: DbTx
  ): Promise<ReverseAssetFundingResult> {
    const original = await this.fundings.findByIdForUpdate(userId, fundingId, tx);
    if (original === null) throw new EntityNotFoundError("Asset funding");
    if (original.status !== "posted" || original.reversedBy !== undefined)
      throw new AssetFundingNotReversibleError();
    const reversal = await this.fundings.createReversal(userId, original, tx);
    const paired = await this.fundings.markReversed(userId, original.id, reversal.id, tx);
    if (paired === null) throw new AssetFundingNotReversibleError();
    await this.audit.record(userId, "asset_funding.reverse", original.id, tx, {
      reversalId: reversal.id
    });
    await this.rollups.invalidate(userId, toISTMonth(original.occurredAt), tx);
    return ReverseAssetFundingResultSchema.parse({ original: paired, reversal });
  }

  async onTransactionReversedInTx(
    userId: string,
    original: Transaction,
    _reversal: Transaction,
    tx: DbTx
  ): Promise<void> {
    const funding = await this.fundings.findActiveByTransactionId(userId, original.id, tx);
    if (funding === null) return;
    const reversal = await this.fundings.createReversal(userId, funding, tx);
    const paired = await this.fundings.markReversed(userId, funding.id, reversal.id, tx);
    if (paired === null) throw new AssetFundingNotReversibleError();
    await this.audit.record(userId, "asset_funding.reverse", funding.id, tx, {
      reversalId: reversal.id,
      source: "transaction_reversal"
    });
    await this.rollups.invalidate(userId, toISTMonth(funding.occurredAt), tx);
  }

  private async resolveTarget(
    userId: string,
    target: AssetFundingTarget,
    transaction: Transaction,
    tx: DbTx
  ): Promise<Asset> {
    if (target.kind === "existing_asset") {
      const asset = await this.assets.findOpenByIdForUpdate(userId, target.assetId, tx);
      if (asset === null) throw new AssetFundingAssetUnavailableError();
      if (asset.kind !== "investment" && asset.kind !== "fixed_deposit")
        throw new AssetFundingAssetUnavailableError();
      return asset;
    }
    const asset = target.asset;
    return this.assetService.createInTx(
      userId,
      {
        kind: asset.kind,
        name: asset.name,
        openedAt: transaction.occurredAt,
        openingValueMinor: transaction.amountMinor,
        ...(asset.kind === "fixed_deposit" && asset.maturityAt !== undefined
          ? { maturityAt: new Date(asset.maturityAt) }
          : {}),
        ...(asset.kind === "fixed_deposit" && asset.annualRateBps !== undefined
          ? { annualRateBps: asset.annualRateBps }
          : {})
      },
      tx
    );
  }

  private assertEligible(transaction: Transaction): void {
    if (
      transaction.type !== "expense" ||
      transaction.transferGroupId !== undefined ||
      transaction.reversalOf !== undefined ||
      transaction.reversedBy !== undefined
    ) {
      throw new AssetFundingSourceNotEligibleError();
    }
  }
}
