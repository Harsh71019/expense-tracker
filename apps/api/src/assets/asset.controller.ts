import { Body, Controller, Get, HttpCode, Param, Post, Res } from "@nestjs/common";
import {
  AssetIdSchema,
  CreateAssetSchema,
  CreateValuationSchema,
  type Asset,
  type Valuation,
  type ValuationPage
} from "@vyaya/shared";
import type { Response } from "express";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { AssetService } from "./asset.service.js";

@Controller("v1/assets")
export class AssetController {
  constructor(private readonly assets: AssetService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ): Promise<Asset> {
    const asset = await this.assets.create(user.id, CreateAssetSchema.parse(body));
    response.setHeader("Location", `/api/v1/assets/${asset.id}`);
    return asset;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Asset[]> {
    return this.assets.list(user.id);
  }

  @Post(":assetId/close")
  @HttpCode(204)
  close(@CurrentUser() user: AuthenticatedUser, @Param("assetId") assetId: string): Promise<void> {
    return this.assets.close(user.id, AssetIdSchema.parse(assetId));
  }

  @Post(":assetId/valuations")
  async addValuation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ): Promise<Valuation> {
    const parsedAssetId = AssetIdSchema.parse(assetId);
    const valuation = await this.assets.addValuation(
      user.id,
      parsedAssetId,
      CreateValuationSchema.parse(body)
    );
    response.setHeader("Location", `/api/v1/assets/${parsedAssetId}/valuations/${valuation.id}`);
    return valuation;
  }

  @Get(":assetId/valuations")
  listValuations(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string
  ): Promise<ValuationPage> {
    return this.assets.listValuations(user.id, AssetIdSchema.parse(assetId));
  }
}
