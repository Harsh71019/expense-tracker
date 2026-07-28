import { Inject, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { withTxn } from "../common/db/db-txn.js";
import { LogEvent } from "../common/logging/events.js";
import { ImportBatchRepository } from "./import-batch.repository.js";
import { ImportsQueue } from "./imports.queue.js";

const CLAIM_LIMIT = 50;
const CLAIM_LEASE_MS = 60_000;
const DISPATCH_RETRY_DELAY_MS = 10_000;

type DispatchLogger = Pick<Logger, "log" | "error">;

@Injectable()
export class ImportDispatchService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb,
    private readonly config: RuntimeConfigService,
    private readonly batches: ImportBatchRepository,
    private readonly queue: ImportsQueue,
    @Inject(Logger) private readonly logger: DispatchLogger
  ) {}

  @Cron("*/10 * * * * *", { timeZone: "Asia/Kolkata" })
  async dispatchReady(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    const now = new Date();
    const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS);
    const claims = await withTxn(this.db, (tx) =>
      this.batches.systemClaimReady(now, leaseUntil, CLAIM_LIMIT, tx)
    );

    let dispatched = 0;
    for (const claim of claims) {
      try {
        await this.queue.enqueueWorkflow(claim);
        dispatched += 1;
      } catch (error) {
        await this.batches.releaseWorkflowClaim(
          claim.userId,
          claim.batchId,
          claim.claimToken,
          new Date(Date.now() + DISPATCH_RETRY_DELAY_MS)
        );
        this.logger.error(
          {
            event: LogEvent.ImportWorkflowDispatchFailed,
            batchId: claim.batchId,
            operation: claim.operation,
            err: error
          },
          "import workflow dispatch failed"
        );
      }
    }

    if (claims.length > 0) {
      this.logger.log(
        {
          event: LogEvent.ImportWorkflowsDispatched,
          claimed: claims.length,
          dispatched
        },
        "import workflows dispatched"
      );
    }
  }
}
