import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  AssetSchema,
  ValuationSchema,
  type Asset,
  type AssetId,
  type CreateAsset,
  type CreateValuation,
  type Valuation
} from "@vyaya/shared";
import type { Connection } from "mongoose";
import { z } from "zod";

import {
  IdempotencyService,
  type IdempotentResult
} from "../common/idempotency/idempotency.service.js";
import { AssetService } from "./asset.service.js";

@Injectable()
export class AssetMutationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly assets: AssetService,
    private readonly idempotency: IdempotencyService
  ) {}

  async create(userId: string, input: CreateAsset, key: string): Promise<IdempotentResult<Asset>> {
    const outcome = await this.idempotency.execute(
      this.connection,
      userId,
      "asset.create",
      key,
      AssetSchema,
      (session) => this.assets.createInSession(userId, input, session)
    );
    // Audit only on the attempt that actually committed -- see
    // AssetService.recordAudit's docstring for why this can't live inside
    // createInSession (called from inside idempotency.execute's retryable
    // Mongo transaction).
    if (!outcome.replayed) {
      await this.assets.recordAudit(userId, "asset.create", outcome.result.id, {
        valueMinor: input.openingValueMinor
      });
    }
    return outcome;
  }

  async close(userId: string, assetId: AssetId, key: string): Promise<IdempotentResult<null>> {
    const outcome = await this.idempotency.execute(
      this.connection,
      userId,
      "asset.close",
      key,
      z.null(),
      (session) => this.assets.closeInSession(userId, assetId, session)
    );
    if (!outcome.replayed) {
      await this.assets.recordAudit(userId, "asset.close", assetId);
    }
    return outcome;
  }

  async addValuation(
    userId: string,
    assetId: AssetId,
    input: CreateValuation,
    key: string
  ): Promise<IdempotentResult<Valuation>> {
    const outcome = await this.idempotency.execute(
      this.connection,
      userId,
      "asset.valuation.create",
      key,
      ValuationSchema,
      (session) => this.assets.addValuationInSession(userId, assetId, input, session)
    );
    if (!outcome.replayed) {
      await this.assets.recordAudit(userId, "asset.valuation.create", outcome.result.id, {
        assetId,
        valueMinor: outcome.result.valueMinor
      });
    }
    return outcome;
  }
}
