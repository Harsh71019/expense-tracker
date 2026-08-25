import { Body, Controller, Get, Headers, Param, Put, Query, Res } from "@nestjs/common";
import {
  EssentialBurnQuerySchema,
  ListReserveSourcesQuerySchema,
  ReserveSourceIdSchema,
  ReserveSourceKindSchema,
  ReserveSummaryQuerySchema,
  UpdateReserveSourceSchema,
  type EssentialBurnResponse,
  type ReserveSource,
  type ReserveSourcePage,
  type ReserveSummary
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { EssentialBurnService } from "./essential-burn.service.js";
import { ReserveSourceService } from "./reserve-source.service.js";
import { ReserveValueService } from "./reserve-value.service.js";

const IdempotencyKeySchema = z.string().uuid();

/**
 * HTTP controller exposing financial-safety baseline and emergency reserve
 * source queries/mutations.
 *
 * Rules:
 * - HTTP validation and delegation only.
 * - Authenticated user extracted strictly from @CurrentUser().
 * - No Drizzle or calculation logic in the controller.
 */
@Controller("v1/financial-safety")
export class FinancialSafetyController {
  constructor(
    private readonly essentialBurn: EssentialBurnService,
    private readonly reserveSourceService: ReserveSourceService,
    private readonly reserveValueService: ReserveValueService
  ) {}

  @Get("essential-burn")
  getEssentialBurn(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<EssentialBurnResponse> {
    const { asOf } = EssentialBurnQuerySchema.parse(query);
    return asOf === undefined
      ? this.essentialBurn.getEssentialBurn(user.id)
      : this.essentialBurn.getEssentialBurn(user.id, asOf);
  }

  @Get("reserve-sources")
  listReserveSources(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<ReserveSourcePage> {
    return this.reserveValueService.listSources(
      user.id,
      ListReserveSourcesQuerySchema.parse(query)
    );
  }

  @Put("reserve-sources/:sourceKind/:sourceId")
  async updateReserveSource(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sourceKind") sourceKindParam: string,
    @Param("sourceId") sourceIdParam: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<ReserveSource> {
    const sourceKind = ReserveSourceKindSchema.parse(sourceKindParam);
    const sourceId = ReserveSourceIdSchema.parse(sourceIdParam);
    const idempotencyKey = IdempotencyKeySchema.parse(key);
    const input = UpdateReserveSourceSchema.parse(body);

    const result = await this.reserveSourceService.updateSource(
      user.id,
      sourceKind,
      sourceId,
      input,
      idempotencyKey
    );
    if (result.replayed) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Get("reserves")
  getReserves(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<ReserveSummary> {
    const { asOf } = ReserveSummaryQuerySchema.parse(query);
    return asOf === undefined
      ? this.reserveValueService.getSummary(user.id)
      : this.reserveValueService.getSummary(user.id, asOf);
  }
}
