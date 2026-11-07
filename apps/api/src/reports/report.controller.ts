import { Controller, Get, Param } from "@nestjs/common";
import { MonthSchema, type MonthlyReport } from "@treasury-ops/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { MonthlyReportService } from "./monthly-report.service.js";

@Controller("v1/reports")
export class ReportController {
  constructor(private readonly reports: MonthlyReportService) {}

  /**
   * A month with no cached rollup yet is computed on demand (and cached
   * from then on) rather than 404ing, as long as it isn't in the future --
   * see MonthlyRollupService.getOrCompute.
   */
  @Get("monthly/:month")
  async monthly(
    @CurrentUser() user: AuthenticatedUser,
    @Param("month") month: string
  ): Promise<MonthlyReport> {
    const report = await this.reports.getReport(user.id, MonthSchema.parse(month));
    if (report === null) throw new EntityNotFoundError("Monthly rollup");
    return report;
  }
}
