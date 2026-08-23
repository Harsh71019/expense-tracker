import { Injectable } from "@nestjs/common";
import {
  AssetMarketLinkSchema,
  type AssetId,
  type AssetMarketLink,
  type CreateAssetMarketLinkRequest
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { AssetMarketRepository } from "./asset-market.repository.js";
import { AssetRepository } from "./asset.repository.js";

@Injectable()
export class AssetMarketLinkService {
  constructor(
    private readonly assets: AssetRepository,
    private readonly market: AssetMarketRepository,
    private readonly audit: AuditRepository
  ) {}

  async getActive(userId: string, assetId: AssetId): Promise<AssetMarketLink> {
    if ((await this.assets.findById(userId, assetId)) === null)
      throw new EntityNotFoundError("Asset");
    const link = await this.market.findActiveLinkByAssetId(userId, assetId);
    if (link === null) throw new EntityNotFoundError("Asset market link");
    return link;
  }

  async setActiveInTx(
    userId: string,
    assetId: AssetId,
    input: CreateAssetMarketLinkRequest,
    tx: DbTx
  ): Promise<AssetMarketLink> {
    if ((await this.assets.findOpenByIdForUpdate(userId, assetId, tx)) === null) {
      throw new EntityNotFoundError("Asset");
    }
    const active = await this.market.findActiveLinkByAssetIdForUpdate(userId, assetId, tx);
    const now = new Date();
    if (active === null) {
      const link = await this.market.createLink(userId, { ...input, assetId }, tx);
      await this.audit.record(userId, "asset.market_link.create", link.id, tx, { assetId });
      return AssetMarketLinkSchema.parse(link);
    }

    if (!(await this.market.supersedeActiveLink(userId, active.id, now, tx))) {
      throw new EntityNotFoundError("Active asset market link");
    }
    const link = await this.market.createLink(
      userId,
      { ...input, assetId, revisionOf: active.id },
      tx
    );
    await this.audit.record(userId, "asset.market_link.revise", link.id, tx, {
      assetId,
      supersededLinkId: active.id
    });
    return AssetMarketLinkSchema.parse(link);
  }
}
