import { Controller, Get, Param } from "@nestjs/common";
import { MonthSchema, type MonthlyRollup } from "@treasury-ops/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { MonthlyRollupService } from "./monthly-rollup.service.js";

@Controller("v1/reports")
export class ReportController {
  constructor(private readonly rollups: MonthlyRollupService) {}

  /**
   * A month with no cached rollup yet is computed on demand (and cached
   * from then on) rather than 404ing, as long as it isn't in the future --
   * see MonthlyRollupService.getOrCompute.
   */
  @Get("monthly/:month")
  async monthly(
    @CurrentUser() user: AuthenticatedUser,
    @Param("month") month: string
  ): Promise<MonthlyRollup> {
    const rollup = await this.rollups.getOrCompute(user.id, MonthSchema.parse(month));
    if (rollup === null) throw new EntityNotFoundError("Monthly rollup");
    return rollup;
  }
}
