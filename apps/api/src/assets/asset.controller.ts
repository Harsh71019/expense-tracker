import { Body, Controller, Get, Headers, HttpCode, Param, Post, Res } from "@nestjs/common";
import {
  AssetIdSchema,
  CreateAssetSchema,
  CreateValuationSchema,
  type Asset,
  type Valuation,
  type ValuationPage
} from "@vyaya/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { AssetService } from "./asset.service.js";
import { AssetMutationService } from "./asset-mutation.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/assets")
export class AssetController {
  constructor(
    private readonly assets: AssetService,
    private readonly mutations?: AssetMutationService
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
    @Headers("idempotency-key") key?: string
  ): Promise<Asset> {
    const input = CreateAssetSchema.parse(body);
    if (this.mutations === undefined) {
      const asset = await this.assets.create(user.id, input);
      response.setHeader("Location", `/api/v1/assets/${asset.id}`);
      return asset;
    }
    const result = await this.mutations.create(user.id, input, IdempotencyKeySchema.parse(key));
    if (result.replayed) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    } else {
      response.setHeader("Location", `/api/v1/assets/${result.result.id}`);
    }
    return result.result;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Asset[]> {
    return this.assets.list(user.id);
  }

  @Post(":assetId/close")
  @HttpCode(204)
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<void> {
    const parsedId = AssetIdSchema.parse(assetId);
    if (this.mutations === undefined) return this.assets.close(user.id, parsedId);
    const result = await this.mutations.close(user.id, parsedId, IdempotencyKeySchema.parse(key));
    if (result.replayed && response !== undefined) {
      response.setHeader("Idempotency-Replayed", "true");
    }
  }

  @Post(":assetId/valuations")
  async addValuation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
    @Headers("idempotency-key") key?: string
  ): Promise<Valuation> {
    const parsedAssetId = AssetIdSchema.parse(assetId);
    const input = CreateValuationSchema.parse(body);
    if (this.mutations === undefined) {
      const valuation = await this.assets.addValuation(user.id, parsedAssetId, input);
      response.setHeader("Location", `/api/v1/assets/${parsedAssetId}/valuations/${valuation.id}`);
      return valuation;
    }
    const result = await this.mutations.addValuation(
      user.id,
      parsedAssetId,
      input,
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    } else {
      response.setHeader(
        "Location",
        `/api/v1/assets/${parsedAssetId}/valuations/${result.result.id}`
      );
    }
    return result.result;
  }

  @Get(":assetId/valuations")
  listValuations(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string
  ): Promise<ValuationPage> {
    return this.assets.listValuations(user.id, AssetIdSchema.parse(assetId));
  }
}
