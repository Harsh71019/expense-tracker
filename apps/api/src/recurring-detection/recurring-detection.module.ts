import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { IdempotencyModule } from "../common/idempotency/idempotency.module.js";
import { RecurringModule } from "../recurring/recurring.module.js";
import { RecurringDetectionReviewController } from "./recurring-detection-review.controller.js";
import { RecurringDetectionReviewService } from "./recurring-detection-review.service.js";

import { RecurringDetectionQueue } from "./recurring-detection.queue.js";
import { RecurringDetectionRepository } from "./recurring-detection.repository.js";
import { RecurringDetectionScheduleService } from "./recurring-detection-schedule.service.js";
import { RecurringDetectionService } from "./recurring-detection.service.js";

@Module({
  imports: [RecurringModule, IdempotencyModule, AuditModule],
  controllers: [RecurringDetectionReviewController],
  providers: [
    RecurringDetectionRepository,
    RecurringDetectionService,
    RecurringDetectionQueue,
    RecurringDetectionScheduleService,
    RecurringDetectionReviewService
  ],
  exports: [RecurringDetectionService, RecurringDetectionQueue]
})
export class RecurringDetectionModule {}
