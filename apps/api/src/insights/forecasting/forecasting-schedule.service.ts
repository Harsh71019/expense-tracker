import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Logger } from "nestjs-pino";

import { NtfyOpsNotifierService } from "../../common/observability/ntfy-ops-notifier.service.js";
import { ForecastingQueue } from "./forecasting.queue.js";
import { ForecastingRepository } from "./forecasting.repository.js";

@Injectable()
export class ForecastingScheduleService {
  constructor(
    private readonly repository: ForecastingRepository,
    private readonly queue: ForecastingQueue,
    @Inject(NtfyOpsNotifierService) private readonly ntfy: Pick<NtfyOpsNotifierService, "notify">,
    private readonly logger: Logger
  ) {}
  /** Daily read-only snapshot refresh. Cross-tenant discovery is explicitly isolated in systemFindUsersNeedingForecast. */
  @Cron("7 1 * * *", { timeZone: "Asia/Kolkata" })
  async enqueueDaily(): Promise<void> {
    const asOf = new Date();
    try {
      const users = await this.repository.systemFindUsersNeedingForecast(asOf, 200);
      await Promise.all(users.map(async (userId) => this.queue.enqueue(userId, asOf)));
      this.logger.log(
        { event: "forecast.enqueued", userCount: users.length },
        "cash-flow forecast refresh enqueued"
      );
      await this.ntfy.notify({
        title: "✅ forecasting.enqueue_daily",
        message: `enqueued for ${users.length} user(s)`,
        tags: ["white_check_mark"]
      });
    } catch (error) {
      await this.ntfy.notify({
        title: "❌ forecasting.enqueue_daily failed",
        message: error instanceof Error ? error.message : "Unknown failure",
        priority: "high",
        tags: ["rotating_light"]
      });
      throw error;
    }
  }
}
