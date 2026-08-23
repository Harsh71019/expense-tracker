import { Injectable } from "@nestjs/common";
import {
  AssetMarketLinkSchema,
  AssetPositionEventSchema,
  MarketLinkedAssetCreationResultSchema,
  ReverseAssetPositionEventResultSchema,
  type AssetId,
  type AssetMarketLink,
  type AssetPositionEvent,
  type AssetPositionEventId,
  type CreateAssetMarketLinkRequest,
  type CreateManualAssetPositionEvent,
  type CreateMarketLinkedAsset,
  type MarketLinkedAssetCreationResult,
  type ReverseAssetPositionEventResult
} from "@treasury-ops/shared";

import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { AssetMarketLinkService } from "./asset-market-link.service.js";
import { AssetPositionService } from "./asset-position.service.js";
import { MarketLinkedAssetService } from "./market-linked-asset.service.js";

@Injectable()
export class AssetMarketMutationService {
  constructor(
    private readonly idempotency: IdempotencyPostgresService,
    private readonly links: AssetMarketLinkService,
    private readonly positions: AssetPositionService,
    private readonly marketLinkedAssets: MarketLinkedAssetService
  ) {}

  createMarketLinkedAsset(
    userId: string,
    input: CreateMarketLinkedAsset,
    key: string
  ): Promise<IdempotentResult<MarketLinkedAssetCreationResult>> {
    return this.idempotency.execute(
      userId,
      "asset.market_linked.create",
      key,
      input,
      MarketLinkedAssetCreationResultSchema,
      (tx) => this.marketLinkedAssets.createInTx(userId, input, `market-linked-opening:${key}`, tx)
    );
  }

  setMarketLink(
    userId: string,
    assetId: AssetId,
    input: CreateAssetMarketLinkRequest,
    key: string
  ): Promise<IdempotentResult<AssetMarketLink>> {
    return this.idempotency.execute(
      userId,
      "asset.market_link.set",
      key,
      { assetId, input },
      AssetMarketLinkSchema,
      (tx) => this.links.setActiveInTx(userId, assetId, input, tx)
    );
  }

  createPositionEvent(
    userId: string,
    assetId: AssetId,
    input: CreateManualAssetPositionEvent,
    key: string
  ): Promise<IdempotentResult<AssetPositionEvent>> {
    return this.idempotency.execute(
      userId,
      "asset.position_event.create",
      key,
      { assetId, input },
      AssetPositionEventSchema,
      (tx) => this.positions.createManualInTx(userId, assetId, input, `manual:${key}`, tx)
    );
  }

  reversePositionEvent(
    userId: string,
    assetId: AssetId,
    eventId: AssetPositionEventId,
    key: string
  ): Promise<IdempotentResult<ReverseAssetPositionEventResult>> {
    return this.idempotency.execute(
      userId,
      "asset.position_event.reverse",
      key,
      { assetId, eventId },
      ReverseAssetPositionEventResultSchema,
      (tx) => this.positions.reverseInTx(userId, assetId, eventId, `manual-reversal:${key}`, tx)
    );
  }
}
