import { Module } from "@nestjs/common";

import { ReportsModule } from "../reports/reports.module.js";
import { SpendingWarningsController } from "./spending-warnings.controller.js";
import { SpendingWarningsMutationService } from "./spending-warnings-mutation.service.js";
import { SpendingWarningsQueue } from "./spending-warnings.queue.js";
import { SpendingWarningsRepository } from "./spending-warnings.repository.js";
import { SpendingWarningsScheduleService } from "./spending-warnings-schedule.service.js";
import { SpendingWarningsService } from "./spending-warnings.service.js";

@Module({
  imports: [ReportsModule],
  controllers: [SpendingWarningsController],
  providers: [
    SpendingWarningsRepository,
    SpendingWarningsService,
    SpendingWarningsMutationService,
    SpendingWarningsQueue,
    SpendingWarningsScheduleService
  ],
  exports: [SpendingWarningsService, SpendingWarningsQueue]
})
export class SpendingWarningsModule {}
