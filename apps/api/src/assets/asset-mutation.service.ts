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

  create(userId: string, input: CreateAsset, key: string): Promise<IdempotentResult<Asset>> {
    return this.idempotency.execute(
      this.connection,
      userId,
      "asset.create",
      key,
      AssetSchema,
      (session) => this.assets.createInSession(userId, input, session)
    );
  }

  close(userId: string, assetId: AssetId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(
      this.connection,
      userId,
      "asset.close",
      key,
      z.null(),
      (session) => this.assets.closeInSession(userId, assetId, session)
    );
  }

  addValuation(
    userId: string,
    assetId: AssetId,
    input: CreateValuation,
    key: string
  ): Promise<IdempotentResult<Valuation>> {
    return this.idempotency.execute(
      this.connection,
      userId,
      "asset.valuation.create",
      key,
      ValuationSchema,
      (session) => this.assets.addValuationInSession(userId, assetId, input, session)
    );
  }
}
