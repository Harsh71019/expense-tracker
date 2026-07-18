import { Inject, Injectable } from "@nestjs/common";
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
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn as withPgTxn } from "../common/db/db-txn.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { InvalidValuationSignError } from "../common/errors/invalid-valuation-sign.error.js";
import { withTxn, type MongoSession } from "../common/mongo-txn.js";
import { AssetRepository } from "./asset.repository.js";
import { ValuationRepository } from "./valuation.repository.js";

@Injectable()
export class AssetService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly assets: AssetRepository,
    private readonly valuations: ValuationRepository,
    private readonly audit: AuditRepository
  ) {}

  /**
   * Assets/valuations still live in Mongo (Tasks 16/17 not done); audit_log
   * moved to Postgres in Task 11. The audit write can no longer share the
   * Mongo transaction that inserts the asset/valuation, so it must never run
   * *inside* one of the `*InSession` methods below: those run inside
   * `session.withTransaction()`, which the MongoDB driver retries wholesale
   * on transient errors, and re-running an already-committed-elsewhere
   * Postgres write on every retry attempt produced duplicate audit rows
   * under real concurrency (caught by the 5-way concurrent idempotent-replay
   * test -- 11 audit rows instead of 3). Every caller (this class's own
   * public methods, and AssetMutationService after a non-replayed
   * `idempotency.execute()`) calls this exactly once, after its Mongo write
   * has definitively committed -- never from inside a retryable boundary.
   */
  recordAudit(
    userId: string,
    action: string,
    entityId: string,
    meta?: Record<string, unknown>
  ): Promise<void> {
    return withPgTxn(this.db, (tx) => this.audit.record(userId, action, entityId, tx, meta));
  }

  async create(userId: string, input: CreateAsset): Promise<Asset> {
    const asset = await withTxn(this.connection, (session) =>
      this.createInSession(userId, input, session)
    );
    await this.recordAudit(userId, "asset.create", asset.id, {
      valueMinor: input.openingValueMinor
    });
    return asset;
  }

  async createInSession(userId: string, input: CreateAsset, session: MongoSession): Promise<Asset> {
    const asset = await this.assets.create(userId, input, session);
    await this.valuations.create(
      userId,
      asset.id,
      { valueMinor: input.openingValueMinor, valuedAt: input.openedAt, source: "manual" },
      session
    );
    return asset;
  }

  list(userId: string): Promise<Asset[]> {
    return this.assets.list(userId);
  }

  async close(userId: string, assetId: AssetId): Promise<void> {
    await withTxn(this.connection, (session) => this.closeInSession(userId, assetId, session));
    await this.recordAudit(userId, "asset.close", assetId);
  }

  async closeInSession(userId: string, assetId: AssetId, session: MongoSession): Promise<null> {
    if (!(await this.assets.close(userId, assetId, session))) {
      throw new EntityNotFoundError("Asset");
    }
    return null;
  }

  async addValuation(userId: string, assetId: AssetId, input: CreateValuation): Promise<Valuation> {
    const valuation = await withTxn(this.connection, (session) =>
      this.addValuationInSession(userId, assetId, input, session)
    );
    await this.recordAudit(userId, "asset.valuation.create", valuation.id, {
      assetId,
      valueMinor: valuation.valueMinor
    });
    return valuation;
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

    return this.valuations.create(userId, assetId, input, session);
  }

  async listValuations(userId: string, assetId: AssetId): Promise<ValuationPage> {
    const items = await this.valuations.listByAsset(userId, assetId);
    return { items, pageInfo: { nextCursor: null, hasMore: false, limit: items.length } };
  }
}
