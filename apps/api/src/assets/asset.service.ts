import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  type Asset,
  type AssetId,
  type CreateAsset,
  type CreateValuation,
  type Valuation,
  type ValuationPage
} from "@vyaya/shared";
import type { Connection } from "mongoose";

import { AuditRepository } from "../audit/audit.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { InvalidValuationSignError } from "../common/errors/invalid-valuation-sign.error.js";
import { withTxn, type MongoSession } from "../common/mongo-txn.js";
import { AssetRepository } from "./asset.repository.js";
import { ValuationRepository } from "./valuation.repository.js";

@Injectable()
export class AssetService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly assets: AssetRepository,
    private readonly valuations: ValuationRepository,
    private readonly audit: AuditRepository
  ) {}

  async create(userId: string, input: CreateAsset): Promise<Asset> {
    return withTxn(this.connection, (session) => this.createInSession(userId, input, session));
  }

  async createInSession(userId: string, input: CreateAsset, session: MongoSession): Promise<Asset> {
    const asset = await this.assets.create(userId, input, session);
    const valuation = await this.valuations.create(
      userId,
      asset.id,
      { valueMinor: input.openingValueMinor, valuedAt: input.openedAt, source: "manual" },
      session
    );
    await this.audit.record(userId, "asset.create", asset.id, session, {
      valuationId: valuation.id,
      valueMinor: valuation.valueMinor
    });
    return asset;
  }

  list(userId: string): Promise<Asset[]> {
    return this.assets.list(userId);
  }

  async close(userId: string, assetId: AssetId): Promise<void> {
    await withTxn(this.connection, (session) => this.closeInSession(userId, assetId, session));
  }

  async closeInSession(userId: string, assetId: AssetId, session: MongoSession): Promise<null> {
    if (!(await this.assets.close(userId, assetId, session))) {
      throw new EntityNotFoundError("Asset");
    }
    await this.audit.record(userId, "asset.close", assetId, session);
    return null;
  }

  async addValuation(userId: string, assetId: AssetId, input: CreateValuation): Promise<Valuation> {
    return withTxn(this.connection, (session) =>
      this.addValuationInSession(userId, assetId, input, session)
    );
  }

  async addValuationInSession(
    userId: string,
    assetId: AssetId,
    input: CreateValuation,
    session: MongoSession
  ): Promise<Valuation> {
    const asset = await this.assets.findOpenById(userId, assetId, session);
    if (asset === null) {
      throw new EntityNotFoundError("Asset");
    }
    if (asset.kind !== "loan_liability" && input.valueMinor < 0) {
      throw new InvalidValuationSignError();
    }

    const valuation = await this.valuations.create(userId, assetId, input, session);
    await this.audit.record(userId, "asset.valuation.create", valuation.id, session, {
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
