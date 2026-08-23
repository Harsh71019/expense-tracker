import { Inject, Injectable, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DATABASE_CONNECTION, type DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import {
  runScheduled,
  ScheduledRunCoordinator
} from "../common/scheduler/scheduled-run.coordinator.js";
import { PortfolioImportBatchRepository } from "./portfolio-import-batch.repository.js";
import { PortfolioImportPayloadRepository } from "./portfolio-import-payload.repository.js";
import { PortfolioImportService } from "./portfolio-import.service.js";

@Injectable()
export class PortfolioImportSweeperService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly config: RuntimeConfigService,
    private readonly payloads: PortfolioImportPayloadRepository,
    private readonly batches: PortfolioImportBatchRepository,
    private readonly service: PortfolioImportService,
    @Optional() private readonly scheduler?: ScheduledRunCoordinator
  ) {}

  @Cron("*/15 * * * *", { timeZone: "Asia/Kolkata" })
  async sweep(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;
    await runScheduled(this.scheduler, "portfolio_imports.sweep", "minute", async () => {
      const deletedPayloads = await this.sweepExpiredPayloads();
      const processedBatches = await this.sweepStuckBatches();
      return deletedPayloads + processedBatches;
    });
  }

  async sweepExpiredPayloads(): Promise<number> {
    return withTxn(this.db, (tx) => this.payloads.systemDeleteExpired(new Date(), 100, tx));
  }

  async sweepStuckBatches(): Promise<number> {
    const claims = await withTxn(this.db, (tx) =>
      this.batches.systemClaimReady(new Date(), new Date(Date.now() + 5 * 60_000), 5, tx)
    );
    let processed = 0;
    for (const claim of claims) {
      try {
        await this.service.processQueuedBatch(claim.batchId, claim.userId);
        processed += 1;
      } catch {
        // Individual job failures are logged and recorded on the batch
      }
    }
    return processed;
  }
}
