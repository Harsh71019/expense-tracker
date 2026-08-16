import { Module } from "@nestjs/common";

import { ForecastingController } from "./forecasting.controller.js";
import { ForecastingRepository } from "./forecasting.repository.js";
import { ForecastingQueue } from "./forecasting.queue.js";
import { ForecastingScheduleService } from "./forecasting-schedule.service.js";
import { ForecastingService } from "./forecasting.service.js";

@Module({
  controllers: [ForecastingController],
  providers: [
    ForecastingRepository,
    ForecastingService,
    ForecastingQueue,
    ForecastingScheduleService
  ],
  exports: [ForecastingService, ForecastingQueue]
})
export class ForecastingModule {}
