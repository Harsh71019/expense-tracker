import { Global, Module } from "@nestjs/common";

import { ScheduledRunCoordinator } from "./scheduled-run.coordinator.js";
import { ScheduledRunRepository } from "./scheduled-run.repository.js";
import { ScheduledRunWatchdog } from "./scheduled-run.watchdog.js";

@Global()
@Module({
  providers: [ScheduledRunRepository, ScheduledRunCoordinator, ScheduledRunWatchdog],
  exports: [ScheduledRunRepository, ScheduledRunCoordinator]
})
export class SchedulerModule {}
