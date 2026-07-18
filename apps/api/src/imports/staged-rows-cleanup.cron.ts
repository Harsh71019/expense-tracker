import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { lt } from "drizzle-orm";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { stagedRows } from "../common/db/schema/index.js";
import { LogEvent } from "../common/logging/events.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type CleanupLogger = Pick<Logger, "log">;

/**
 * BACKEND.md §6 `staging.sweep`: Mongo expired staged_rows via a TTL index
 * (`expireAfterSeconds`) — Postgres has no equivalent as a plain index, so
 * this cron does the same 7-day expiry as a scheduled DELETE instead.
 * Worker-only guard mirrors every other cron in this codebase.
 */
@Injectable()
export class StagedRowsCleanupCron {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly config: RuntimeConfigService,
    @Inject(Logger) private readonly logger: CleanupLogger
  ) {}

  @Cron("0 4 * * *", { timeZone: "Asia/Kolkata" })
  async run(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
    const deleted = await this.db
      .delete(stagedRows)
      .where(lt(stagedRows.createdAt, cutoff))
      .returning({ id: stagedRows.id });

    this.logger.log(
      { event: LogEvent.StagedRowsCleaned, deletedCount: deleted.length },
      "staged_rows cleanup: deleted rows older than 7 days"
    );
  }
}
