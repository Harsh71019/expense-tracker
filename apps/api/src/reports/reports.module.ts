import { Module } from "@nestjs/common";

import { CategoriesModule } from "../categories/categories.module.js";
import { MonthlyReportService } from "./monthly-report.service.js";
import { MonthlyRollupRepository } from "./monthly-rollup.repository.js";
import { MonthlyRollupService } from "./monthly-rollup.service.js";
import { ReportController } from "./report.controller.js";
import { RollupsRefreshService } from "./rollups-refresh.service.js";

@Module({
  imports: [CategoriesModule],
  controllers: [ReportController],
  providers: [
    MonthlyRollupRepository,
    MonthlyRollupService,
    MonthlyReportService,
    RollupsRefreshService
  ],
  // MonthlyRollupRepository.distinctUserIds() is the existing
  // posted-transaction user discovery path — SpendingWarningsModule reuses
  // it for its daily analysis sweep rather than adding a second unscoped
  // repository method (plan §8).
  exports: [MonthlyRollupRepository, MonthlyRollupService]
})
export class ReportsModule {}
