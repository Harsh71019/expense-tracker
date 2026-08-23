import { Injectable } from "@nestjs/common";
import {
  AssetPositionEventPageSchema,
  AssetPositionEventSchema,
  ReverseAssetPositionEventResultSchema,
  deriveAssetCurrentPosition,
  type AssetId,
  type AssetCurrentPosition,
  type AssetPositionEvent,
  type AssetPositionEventId,
  type AssetPositionEventPage,
  type CreateManualAssetPositionEvent,
  type ListAssetPositionEventsQuery,
  type ReverseAssetPositionEventResult
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import type { DbTx } from "../common/db/db-txn.js";
import {
  AssetMarketLinkRequiredError,
  AssetPositionEventAlreadyReversedError,
  AssetPositionEventNotReversibleError
} from "../common/errors/asset-market.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { AssetMarketRepository } from "./asset-market.repository.js";
import { AssetRepository } from "./asset.repository.js";

@Injectable()
export class AssetPositionService {
  constructor(
    private readonly assets: AssetRepository,
    private readonly market: AssetMarketRepository,
    private readonly audit: AuditRepository
  ) {}

  async listByAsset(
    userId: string,
    assetId: AssetId,
    query: ListAssetPositionEventsQuery
  ): Promise<AssetPositionEventPage> {
    if ((await this.assets.findById(userId, assetId)) === null)
      throw new EntityNotFoundError("Asset");
    return AssetPositionEventPageSchema.parse(
      await this.market.findPositionEventPageByAsset(userId, assetId, query)
    );
  }

  async getCurrentPosition(userId: string, assetId: AssetId): Promise<AssetCurrentPosition> {
    if ((await this.assets.findById(userId, assetId)) === null) {
      throw new EntityNotFoundError("Asset");
    }
    return deriveAssetCurrentPosition(
      assetId,
      await this.market.listAllPositionEventsByAsset(userId, assetId)
    );
  }

  async createManualInTx(
    userId: string,
    assetId: AssetId,
    input: CreateManualAssetPositionEvent,
    sourceReference: string,
    tx: DbTx
  ): Promise<AssetPositionEvent> {
    if ((await this.assets.findOpenByIdForUpdate(userId, assetId, tx)) === null) {
      throw new EntityNotFoundError("Asset");
    }
    if ((await this.market.findActiveLinkByAssetIdForUpdate(userId, assetId, tx)) === null) {
      throw new AssetMarketLinkRequiredError();
    }
    const event = await this.market.createPositionEvent(
      userId,
      { ...input, assetId, source: "manual", sourceReference },
      tx
    );
    await this.audit.record(userId, "asset.position_event.create", event.id, tx, { assetId });
    return AssetPositionEventSchema.parse(event);
  }

  async reverseInTx(
    userId: string,
    assetId: AssetId,
    eventId: AssetPositionEventId,
    sourceReference: string,
    tx: DbTx
  ): Promise<ReverseAssetPositionEventResult> {
    if ((await this.assets.findByIdForUpdate(userId, assetId, tx)) === null) {
      throw new EntityNotFoundError("Asset");
    }
    const original = await this.market.findPositionEventByIdForUpdate(userId, eventId, tx);
    if (original === null || original.assetId !== assetId)
      throw new EntityNotFoundError("Asset position event");
    if (original.eventType === "reversal") throw new AssetPositionEventNotReversibleError();
    if ((await this.market.findReversalForPositionEvent(userId, original.id, tx)) !== null) {
      throw new AssetPositionEventAlreadyReversedError();
    }

    const reversal = await this.market.createPositionEvent(
      userId,
      {
        assetId,
        eventType: "reversal",
        quantityMicroUnits: original.quantityMicroUnits,
        grossAmountMinor: original.grossAmountMinor,
        chargesMinor: original.chargesMinor,
        taxesAtAcquisitionMinor: original.taxesAtAcquisitionMinor,
        occurredAt: new Date(),
        source: "manual",
        sourceReference,
        reversalOf: original.id
      },
      tx
    );
    await this.audit.record(userId, "asset.position_event.reverse", original.id, tx, {
      assetId,
      reversalId: reversal.id
    });
    return ReverseAssetPositionEventResultSchema.parse({ original, reversal });
  }
}
