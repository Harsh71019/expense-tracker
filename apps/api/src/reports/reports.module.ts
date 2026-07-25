import { Module } from "@nestjs/common";

import { MonthlyRollupRepository } from "./monthly-rollup.repository.js";
import { MonthlyRollupService } from "./monthly-rollup.service.js";
import { ReportController } from "./report.controller.js";
import { RollupsRefreshService } from "./rollups-refresh.service.js";

@Module({
  controllers: [ReportController],
  providers: [MonthlyRollupRepository, MonthlyRollupService, RollupsRefreshService],
  exports: [MonthlyRollupRepository, MonthlyRollupService]
})
export class ReportsModule {}
