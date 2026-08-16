import { Controller, Get, Query } from "@nestjs/common";
import { CashflowForecastQuerySchema, type CashflowForecastSnapshot } from "@treasury-ops/shared";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { CurrentUser } from "../../auth/current-user.decorator.js";
import { ForecastingService } from "./forecasting.service.js";

@Controller("v1/insights")
export class ForecastingController {
  constructor(private readonly forecasting: ForecastingService) {}
  @Get("cash-flow-forecast")
  async getForecast(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<CashflowForecastSnapshot | null> {
    const { days } = CashflowForecastQuerySchema.parse(query);
    return this.forecasting.getLatest(user.id, days);
  }
}
