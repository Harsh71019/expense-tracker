import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Logger } from "nestjs-pino";

import { ForecastingQueue } from "./forecasting.queue.js";
import { ForecastingRepository } from "./forecasting.repository.js";

@Injectable()
export class ForecastingScheduleService {
  constructor(
    private readonly repository: ForecastingRepository,
    private readonly queue: ForecastingQueue,
    private readonly logger: Logger
  ) {}
  /** Daily read-only snapshot refresh. Cross-tenant discovery is explicitly isolated in systemFindUsersNeedingForecast. */
  @Cron("7 1 * * *", { timeZone: "Asia/Kolkata" })
  async enqueueDaily(): Promise<void> {
    const asOf = new Date();
    const users = await this.repository.systemFindUsersNeedingForecast(asOf, 200);
    await Promise.all(users.map(async (userId) => this.queue.enqueue(userId, asOf)));
    this.logger.log(
      { event: "forecast.enqueued", userCount: users.length },
      "cash-flow forecast refresh enqueued"
    );
  }
}
