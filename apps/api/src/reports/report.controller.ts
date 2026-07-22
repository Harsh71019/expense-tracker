import { Controller, Get, Param } from "@nestjs/common";
import { MonthSchema, type MonthlyRollup } from "@treasury-ops/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { MonthlyRollupRepository } from "./monthly-rollup.repository.js";

@Controller("v1/reports")
export class ReportController {
  constructor(private readonly rollups: MonthlyRollupRepository) {}

  /**
   * "Dashboard reads rollups, never raw aggregation" (BACKEND.md §6) — a
   * month with no rollup yet (too old, or this month's cron hasn't run yet)
   * 404s rather than falling back to a live aggregation.
   */
  @Get("monthly/:month")
  async monthly(
    @CurrentUser() user: AuthenticatedUser,
    @Param("month") month: string
  ): Promise<MonthlyRollup> {
    const rollup = await this.rollups.findByMonth(user.id, MonthSchema.parse(month));
    if (rollup === null) throw new EntityNotFoundError("Monthly rollup");
    return rollup;
  }
}
