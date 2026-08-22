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
import { AssetMovedToReceivablesError } from "../common/errors/asset-moved-to-receivables.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { InvalidValuationSignError } from "../common/errors/invalid-valuation-sign.error.js";
import { ReceivableService } from "../receivables/receivable.service.js";
import { AssetRepository } from "./asset.repository.js";
import { ValuationRepository } from "./valuation.repository.js";

@Injectable()
export class AssetService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly assets: AssetRepository,
    private readonly valuations: ValuationRepository,
    private readonly audit: AuditRepository,
    private readonly receivableService: ReceivableService
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

    // Staged POST /assets compatibility adapter (plan doc §13.3 step 3): a
    // caller still creating a `loan_receivable` asset gets it transparently
    // routed into the receivables sub-ledger too, atomically with the legacy
    // anchor above, so it immediately shows up under Debt Given instead of
    // requiring a later migration run. A zero opening value has nothing
    // outstanding to track (and `opening_balance` mode requires a positive
    // amount), so it's left as a plain legacy asset in that edge case.
    if (input.kind === "loan_receivable" && input.openingValueMinor > 0) {
      await this.receivableService.createInTx(
        userId,
        {
          fundingMode: "opening_balance",
          counterpartyName: input.name,
          outstandingMinor: input.openingValueMinor,
          openedAt: input.openedAt
        },
        tx,
        asset.id
      );
    }

    return asset;
  }

  list(userId: string): Promise<Asset[]> {
    return this.assets.list(userId);
  }

  async getById(userId: string, assetId: AssetId): Promise<Asset> {
    const asset = await this.assets.findById(userId, assetId);
    if (asset === null) {
      throw new EntityNotFoundError("Asset");
    }
    return asset;
  }

  async close(userId: string, assetId: AssetId): Promise<void> {
    await withTxn(this.db, (tx) => this.closeInTx(userId, assetId, tx));
  }

  async closeInTx(userId: string, assetId: AssetId, tx: DbTx): Promise<null> {
    await this.assertNotMovedToReceivables(userId, assetId, tx);
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
    await this.assertNotMovedToReceivables(userId, assetId, tx);
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

  private async assertNotMovedToReceivables(
    userId: string,
    assetId: AssetId,
    tx: DbTx
  ): Promise<void> {
    const receivable = await this.receivableService.findByLegacyAssetId(userId, assetId, tx);
    if (receivable !== null) {
      throw new AssetMovedToReceivablesError(receivable.id);
    }
  }
}
