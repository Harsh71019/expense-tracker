import { Injectable } from "@nestjs/common";
import {
  MarketLinkedAssetCreationResultSchema,
  microUnitsToMilliUnits,
  type CreateAsset,
  type CreateMarketLinkedAsset,
  type MarketLinkedAssetCreationResult
} from "@treasury-ops/shared";

import type { DbTx } from "../common/db/db-txn.js";
import { AssetMarketLinkService } from "./asset-market-link.service.js";
import { AssetPositionService } from "./asset-position.service.js";
import { AssetService } from "./asset.service.js";

@Injectable()
export class MarketLinkedAssetService {
  constructor(
    private readonly assets: AssetService,
    private readonly links: AssetMarketLinkService,
    private readonly positions: AssetPositionService
  ) {}

  async createInTx(
    userId: string,
    input: CreateMarketLinkedAsset,
    sourceReference: string,
    tx: DbTx
  ): Promise<MarketLinkedAssetCreationResult> {
    const asset = await this.assets.createInTx(userId, this.assetInput(input), tx);
    const marketLink = await this.links.setActiveInTx(userId, asset.id, input.marketLink, tx);
    const openingPosition = await this.positions.createManualInTx(
      userId,
      asset.id,
      input.openingPosition,
      sourceReference,
      tx
    );
    return MarketLinkedAssetCreationResultSchema.parse({ asset, marketLink, openingPosition });
  }

  private assetInput(input: CreateMarketLinkedAsset): CreateAsset {
    if (input.asset.kind !== "gold" && input.asset.kind !== "silver") return input.asset;
    return {
      ...input.asset,
      quantityMilliUnits: microUnitsToMilliUnits(input.openingPosition.quantityMicroUnits)
    };
  }
}
