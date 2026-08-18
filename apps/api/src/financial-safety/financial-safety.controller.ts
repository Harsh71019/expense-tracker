import { Controller, Get, Query } from "@nestjs/common";
import { EssentialBurnQuerySchema, type EssentialBurnResponse } from "@treasury-ops/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { EssentialBurnService } from "./essential-burn.service.js";

/**
 * HTTP controller exposing financial-safety baseline queries.
 *
 * Rules:
 * - HTTP validation and delegation only.
 * - Authenticated user extracted strictly from @CurrentUser().
 * - No Drizzle or calculation logic in the controller.
 */
@Controller("v1/financial-safety")
export class FinancialSafetyController {
  constructor(private readonly service: EssentialBurnService) {}

  @Get("essential-burn")
  getEssentialBurn(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<EssentialBurnResponse> {
    const { asOf } = EssentialBurnQuerySchema.parse(query);
    return asOf === undefined
      ? this.service.getEssentialBurn(user.id)
      : this.service.getEssentialBurn(user.id, asOf);
  }
}
