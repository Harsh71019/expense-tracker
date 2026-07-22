import { Inject, Injectable } from "@nestjs/common";
import {
  type Asset,
  type AssetId,
  type CreateAsset,
  type CreateValuation,
  type Valuation,
  type ValuationPage
} from "@treasury-ops/shared";

import { AuditRepository } from "../audit/audit.repository.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import type { DbTx } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { InvalidValuationSignError } from "../common/errors/invalid-valuation-sign.error.js";
import { AssetRepository } from "./asset.repository.js";
import { ValuationRepository } from "./valuation.repository.js";

@Injectable()
export class AssetService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly assets: AssetRepository,
    private readonly valuations: ValuationRepository,
    private readonly audit: AuditRepository
  ) {}

  async create(userId: string, input: CreateAsset): Promise<Asset> {
    return withTxn(this.db, (tx) => this.createInTx(userId, input, tx));
  }

  async createInTx(userId: string, input: CreateAsset, tx: DbTx): Promise<Asset> {
    const asset = await this.assets.create(userId, input, tx);
    const valuation = await this.valuations.create(
      userId,
      asset.id,
      { valueMinor: input.openingValueMinor, valuedAt: input.openedAt, source: "manual" },
      tx
    );
    await this.audit.record(userId, "asset.create", asset.id, tx, {
      valuationId: valuation.id,
      valueMinor: valuation.valueMinor
    });
    return asset;
  }

  list(userId: string): Promise<Asset[]> {
    return this.assets.list(userId);
  }

  async close(userId: string, assetId: AssetId): Promise<void> {
    await withTxn(this.db, (tx) => this.closeInTx(userId, assetId, tx));
  }

  async closeInTx(userId: string, assetId: AssetId, tx: DbTx): Promise<null> {
    if (!(await this.assets.close(userId, assetId, tx))) {
      throw new EntityNotFoundError("Asset");
    }
    await this.audit.record(userId, "asset.close", assetId, tx);
    return null;
  }

  async addValuation(userId: string, assetId: AssetId, input: CreateValuation): Promise<Valuation> {
    return withTxn(this.db, (tx) => this.addValuationInTx(userId, assetId, input, tx));
  }

  async addValuationInTx(
    userId: string,
    assetId: AssetId,
    input: CreateValuation,
    tx: DbTx
  ): Promise<Valuation> {
    const asset = await this.assets.findOpenById(userId, assetId, tx);
    if (asset === null) {
      throw new EntityNotFoundError("Asset");
    }
    if (asset.kind !== "loan_liability" && input.valueMinor < 0) {
      throw new InvalidValuationSignError();
    }

    const valuation = await this.valuations.create(userId, assetId, input, tx);
    await this.audit.record(userId, "asset.valuation.create", valuation.id, tx, {
      assetId,
      valueMinor: valuation.valueMinor
    });
    return valuation;
  }

  async listValuations(userId: string, assetId: AssetId): Promise<ValuationPage> {
    const items = await this.valuations.listByAsset(userId, assetId);
    return { items, pageInfo: { nextCursor: null, hasMore: false, limit: items.length } };
  }
}
