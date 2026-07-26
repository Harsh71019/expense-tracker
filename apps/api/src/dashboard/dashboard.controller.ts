import { Controller, Get, Query } from "@nestjs/common";
import {
  CashflowQuerySchema,
  DashboardStatsQuerySchema,
  RecentActivityQuerySchema,
  RecurringForecastQuerySchema,
  SpendMixQuerySchema,
  TopSpendingQuerySchema,
  type CashflowResponse,
  type DashboardInvestments,
  type DashboardStats,
  type DashboardSummary,
  type RecentActivityItem,
  type RecurringForecast,
  type SpendMix,
  type TopSpendingItem
} from "@treasury-ops/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("v1/dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  getSummary(@CurrentUser() user: AuthenticatedUser): Promise<DashboardSummary> {
    return this.dashboard.getSummary(user.id);
  }

  @Get("recent-activity")
  getRecentActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<RecentActivityItem[]> {
    const { limit } = RecentActivityQuerySchema.parse(query);
    return this.dashboard.getRecentActivity(user.id, limit);
  }

  @Get("stats")
  getStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<DashboardStats> {
    const { period } = DashboardStatsQuerySchema.parse(query);
    return this.dashboard.getStats(user.id, period);
  }

  @Get("cashflow")
  getCashflow(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<CashflowResponse> {
    const { range } = CashflowQuerySchema.parse(query);
    return this.dashboard.getCashflow(user.id, range);
  }

  @Get("top-spending")
  getTopSpending(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<TopSpendingItem[]> {
    const { range, limit } = TopSpendingQuerySchema.parse(query);
    return this.dashboard.getTopSpending(user.id, range, limit);
  }

  @Get("spend-mix")
  getSpendMix(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown): Promise<SpendMix> {
    const { range } = SpendMixQuerySchema.parse(query);
    return this.dashboard.getSpendMix(user.id, range);
  }

  @Get("investments")
  getInvestments(@CurrentUser() user: AuthenticatedUser): Promise<DashboardInvestments> {
    return this.dashboard.getInvestments(user.id);
  }

  @Get("recurring-forecast")
  getRecurringForecast(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<RecurringForecast> {
    const { range } = RecurringForecastQuerySchema.parse(query);
    return this.dashboard.getRecurringForecast(user.id, range);
  }
}
