import { Injectable } from "@nestjs/common";
import {
  AssetSchema,
  ValuationSchema,
  type Asset,
  type AssetId,
  type CreateAsset,
  type CreateValuation,
  type Valuation
} from "@vyaya/shared";
import { z } from "zod";

import { IdempotencyPostgresService } from "../common/idempotency/idempotency-postgres.service.js";
import type { IdempotentResult } from "../common/idempotency/idempotency-postgres.service.js";
import { AssetService } from "./asset.service.js";

@Injectable()
export class AssetMutationService {
  constructor(
    private readonly assets: AssetService,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  create(userId: string, input: CreateAsset, key: string): Promise<IdempotentResult<Asset>> {
    return this.idempotency.execute(userId, "asset.create", key, AssetSchema, (tx) =>
      this.assets.createInTx(userId, input, tx)
    );
  }

  close(userId: string, assetId: AssetId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(userId, "asset.close", key, z.null(), (tx) =>
      this.assets.closeInTx(userId, assetId, tx)
    );
  }

  addValuation(
    userId: string,
    assetId: AssetId,
    input: CreateValuation,
    key: string
  ): Promise<IdempotentResult<Valuation>> {
    return this.idempotency.execute(userId, "asset.valuation.create", key, ValuationSchema, (tx) =>
      this.assets.addValuationInTx(userId, assetId, input, tx)
    );
  }
}
