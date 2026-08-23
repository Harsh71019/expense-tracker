import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res
} from "@nestjs/common";
import {
  AssetIdSchema,
  AssetPositionEventIdSchema,
  CreateMarketLinkedAssetSchema,
  CreateAssetMarketLinkRequestSchema,
  CreateManualAssetPositionEventSchema,
  EstimateDisposalRequestSchema,
  ListAssetPositionEventsQuerySchema,
  ListMarketInstrumentsQuerySchema,
  type AssetCurrentPosition,
  type AssetMarketLink,
  type AssetMarketValuationDetails,
  type AssetPositionEvent,
  type AssetPositionEventPage,
  type DisposalEstimateResult,
  type MarketInstrumentPage,
  type MarketLinkedAssetCreationResult,
  type ReverseAssetPositionEventResult
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { AssetMarketLinkService } from "./asset-market-link.service.js";
import { AssetMarketMutationService } from "./asset-market-mutation.service.js";
import { AssetMarketValuationService } from "./asset-market-valuation.service.js";
import { AssetPositionService } from "./asset-position.service.js";
import { DisposalEstimateService } from "./disposal-estimate.service.js";
import { InstrumentDiscoveryService } from "./instrument-discovery.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/assets")
export class AssetMarketController {
  constructor(
    private readonly links: AssetMarketLinkService,
    private readonly positions: AssetPositionService,
    private readonly mutations: AssetMarketMutationService,
    private readonly instruments: InstrumentDiscoveryService,
    private readonly valuations: AssetMarketValuationService,
    private readonly disposalEstimates: DisposalEstimateService
  ) {}

  @Get("instruments")
  listInstruments(@Query() query: unknown): Promise<MarketInstrumentPage> {
    return this.instruments.searchInstruments(ListMarketInstrumentsQuerySchema.parse(query));
  }

  @Post("market-linked")
  async createMarketLinkedAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<MarketLinkedAssetCreationResult> {
    const result = await this.mutations.createMarketLinkedAsset(
      user.id,
      CreateMarketLinkedAssetSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.status(200).setHeader("Idempotency-Replayed", "true");
    else response.setHeader("Location", `/api/v1/assets/${result.result.asset.id}`);
    return result.result;
  }

  @Get(":assetId/market-link")
  @Header("Cache-Control", "no-store")
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
  @Header("Cache-Control", "no-store")
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

  @Get(":assetId/position")
  @Header("Cache-Control", "no-store")
  getCurrentPosition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string
  ): Promise<AssetCurrentPosition> {
    return this.positions.getCurrentPosition(user.id, AssetIdSchema.parse(assetId));
  }

  @Get(":assetId/market-valuation")
  @Header("Cache-Control", "no-store")
  getMarketValuation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string
  ): Promise<AssetMarketValuationDetails> {
    return this.valuations.getValuationDetails(user.id, AssetIdSchema.parse(assetId));
  }

  @Post(":assetId/market-refreshes")
  @HttpCode(202)
  refreshMarketValuation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string,
    @Headers("idempotency-key") key: string | undefined
  ): Promise<{ status: "queued" | "completed"; assetId: string }> {
    IdempotencyKeySchema.parse(key);
    return this.valuations.triggerRefresh(user.id, AssetIdSchema.parse(assetId));
  }

  @Post(":assetId/disposal-estimates")
  @HttpCode(200)
  estimateDisposal(
    @CurrentUser() user: AuthenticatedUser,
    @Param("assetId") assetId: string,
    @Body() body: unknown
  ): Promise<DisposalEstimateResult> {
    return this.disposalEstimates.estimateDisposal(
      user.id,
      AssetIdSchema.parse(assetId),
      EstimateDisposalRequestSchema.parse(body)
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
