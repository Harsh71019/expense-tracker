import { Inject, Injectable, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import {
  runScheduled,
  ScheduledRunCoordinator
} from "../common/scheduler/scheduled-run.coordinator.js";
import { MarketRatesService } from "./market-rates.service.js";

/** Refreshes the globally cached indicative spot quotes once each IST day. */
@Injectable()
export class MarketRatesRefreshService {
  constructor(
    private readonly config: RuntimeConfigService,
    @Inject(MarketRatesService)
    private readonly marketRates: Pick<MarketRatesService, "refreshRates">,
    @Optional() private readonly scheduler?: ScheduledRunCoordinator
  ) {}

  @Cron("0 18 * * *", { timeZone: "Asia/Kolkata" })
  async refresh(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    await runScheduled(this.scheduler, "assets.market_rates_refresh", "daily", async () => {
      await this.marketRates.refreshRates();
      return 2;
    });
  }
}
