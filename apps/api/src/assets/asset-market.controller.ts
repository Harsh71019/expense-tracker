import { Body, Controller, Get, Headers, Param, Post, Query, Res } from "@nestjs/common";
import {
  AssetIdSchema,
  AssetPositionEventIdSchema,
  CreateAssetMarketLinkRequestSchema,
  CreateManualAssetPositionEventSchema,
  ListAssetPositionEventsQuerySchema,
  type AssetMarketLink,
  type AssetPositionEvent,
  type AssetPositionEventPage,
  type ReverseAssetPositionEventResult
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { AssetMarketLinkService } from "./asset-market-link.service.js";
import { AssetMarketMutationService } from "./asset-market-mutation.service.js";
import { AssetPositionService } from "./asset-position.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/assets")
export class AssetMarketController {
  constructor(
    private readonly links: AssetMarketLinkService,
    private readonly positions: AssetPositionService,
    private readonly mutations: AssetMarketMutationService
  ) {}

  @Get(":assetId/market-link")
  getMarketLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string
  ): Promise<AssetMarketLink> {
    return this.links.getActive(user.id, AssetIdSchema.parse(assetId));
  }

  @Post(":assetId/market-link")
  async setMarketLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<AssetMarketLink> {
    const parsedAssetId = AssetIdSchema.parse(assetId);
    const result = await this.mutations.setMarketLink(
      user.id,
      parsedAssetId,
      CreateAssetMarketLinkRequestSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.status(200).setHeader("Idempotency-Replayed", "true");
    else response.setHeader("Location", `/api/v1/assets/${parsedAssetId}/market-link`);
    return result.result;
  }

  @Get(":assetId/position-events")
  listPositionEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string,
    @Query() query: unknown
  ): Promise<AssetPositionEventPage> {
    return this.positions.listByAsset(
      user.id,
      AssetIdSchema.parse(assetId),
      ListAssetPositionEventsQuerySchema.parse(query)
    );
  }

  @Post(":assetId/position-events")
  async createPositionEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<AssetPositionEvent> {
    const parsedAssetId = AssetIdSchema.parse(assetId);
    const result = await this.mutations.createPositionEvent(
      user.id,
      parsedAssetId,
      CreateManualAssetPositionEventSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.status(200).setHeader("Idempotency-Replayed", "true");
    else {
      response.setHeader(
        "Location",
        `/api/v1/assets/${parsedAssetId}/position-events/${result.result.id}`
      );
    }
    return result.result;
  }

  @Post(":assetId/position-events/:eventId/reversals")
  async reversePositionEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string,
    @Param("eventId") eventId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<ReverseAssetPositionEventResult> {
    const parsedAssetId = AssetIdSchema.parse(assetId);
    const result = await this.mutations.reversePositionEvent(
      user.id,
      parsedAssetId,
      AssetPositionEventIdSchema.parse(eventId),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.status(200).setHeader("Idempotency-Replayed", "true");
    else {
      response.setHeader(
        "Location",
        `/api/v1/assets/${parsedAssetId}/position-events/${result.result.reversal.id}`
      );
    }
    return result.result;
  }
}
