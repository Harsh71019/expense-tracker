import { Module } from "@nestjs/common";

import { RecurringDetectionQueue } from "./recurring-detection.queue.js";
import { RecurringDetectionRepository } from "./recurring-detection.repository.js";
import { RecurringDetectionScheduleService } from "./recurring-detection-schedule.service.js";
import { RecurringDetectionService } from "./recurring-detection.service.js";

@Module({
  providers: [
    RecurringDetectionRepository,
    RecurringDetectionService,
    RecurringDetectionQueue,
    RecurringDetectionScheduleService
  ],
  exports: [RecurringDetectionService, RecurringDetectionQueue]
})
export class RecurringDetectionModule {}
