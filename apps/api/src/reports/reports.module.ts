import { Module } from "@nestjs/common";

import { MonthlyRollupRepository } from "./monthly-rollup.repository.js";
import { ReportController } from "./report.controller.js";
import { RollupsRefreshService } from "./rollups-refresh.service.js";

@Module({
  controllers: [ReportController],
  providers: [MonthlyRollupRepository, RollupsRefreshService]
})
export class ReportsModule {}
