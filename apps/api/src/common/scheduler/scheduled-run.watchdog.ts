import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../config/runtime-config.service.js";
import { LogEvent } from "../logging/events.js";
import { ScheduledRunCoordinator } from "./scheduled-run.coordinator.js";
import { ScheduledRunRepository } from "./scheduled-run.repository.js";

const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60_000;
const EXPECTED_MAX_AGE_MS = new Map<string, number>([
  ["notifications.sweep", 5 * 60_000],
  ["recurring.materialize", 26 * 60 * 60_000],
  ["rollups.refresh", 26 * 60 * 60_000],
  ["goals.progress", 26 * 60 * 60_000],
  ["imports.staged_rows_cleanup", 26 * 60 * 60_000],
  ["spending_warnings.schedule", 26 * 60 * 60_000],
  ["budgets.alerts", 26 * 60 * 60_000],
  ["balances.verify", 8 * 24 * 60 * 60_000]
]);

@Injectable()
export class ScheduledRunWatchdog {
  constructor(
    private readonly config: RuntimeConfigService,
    private readonly coordinator: ScheduledRunCoordinator,
    private readonly runs: ScheduledRunRepository,
    @Inject(Logger) private readonly logger: Pick<Logger, "error">
  ) {}

  @Cron("*/15 * * * *", { timeZone: "Asia/Kolkata" })
  async inspect(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;
    await this.coordinator.run("scheduler.watchdog", "minute", async () => {
      const now = new Date();
      const expired = await this.runs.systemFailExpired(now);
      for (const run of expired) {
        this.logger.error(
          {
            event: LogEvent.SchedulerRunOverlong,
            runId: run.id,
            jobName: run.jobName,
            startedAt: run.startedAt
          },
          "scheduled run lease expired"
        );
      }

      const latest = await this.runs.systemLatestByJob();
      for (const run of latest) {
        const maxAgeMs = EXPECTED_MAX_AGE_MS.get(run.jobName);
        if (maxAgeMs === undefined || now.getTime() - run.scheduledFor.getTime() <= maxAgeMs) {
          continue;
        }
        this.logger.error(
          {
            event: LogEvent.SchedulerRunMissing,
            jobName: run.jobName,
            lastScheduledFor: run.scheduledFor,
            lastStatus: run.status
          },
          "scheduled job has not recorded a recent run"
        );
      }

      const deleted = await this.runs.systemDeleteTerminalBefore(
        new Date(now.getTime() - HISTORY_RETENTION_MS)
      );
      return expired.length + deleted;
    });
  }
}
