import { Module } from "@nestjs/common";

import { SpendingChangeDetectionQueue } from "./spending-change-detection.queue.js";
import { SpendingChangeDetectionRepository } from "./spending-change-detection.repository.js";
import { SpendingChangeDetectionScheduleService } from "./spending-change-detection.schedule.service.js";
import { SpendingChangeDetectionService } from "./spending-change-detection.service.js";

@Module({
  providers: [
    SpendingChangeDetectionRepository,
    SpendingChangeDetectionService,
    SpendingChangeDetectionQueue,
    SpendingChangeDetectionScheduleService
  ],
  exports: [
    SpendingChangeDetectionRepository,
    SpendingChangeDetectionService,
    SpendingChangeDetectionQueue
  ]
})
export class SpendingChangeDetectionModule {}
