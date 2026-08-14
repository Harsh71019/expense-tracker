import { Inject, Injectable, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import {
  runScheduled,
  ScheduledRunCoordinator
} from "../common/scheduler/scheduled-run.coordinator.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { RecurringReconciliationService } from "./recurring-reconciliation.service.js";

const RECOVERY_LOOKBACK_DAYS = 7;
const RECOVERY_BATCH_LIMIT = 200;

type SweepLogger = Pick<Logger, "log" | "error">;

/**
 * Replays recent API transactions through tenant-scoped reconciliation.
 * This closes both timing gaps: an email that arrived before its occurrence
 * was materialized, and historical best-effort hook failures from before
 * reconciliation became part of the ledger transaction.
 */
@Injectable()
export class RecurringReconciliationSweepService {
  constructor(
    private readonly config: RuntimeConfigService,
    private readonly transactions: TransactionRepository,
    private readonly reconciliation: RecurringReconciliationService,
    @Inject(Logger) private readonly logger: SweepLogger,
    @Optional() private readonly scheduler?: ScheduledRunCoordinator
  ) {}

  @Cron("15 1 * * *", { timeZone: "Asia/Kolkata" })
  async sweep(): Promise<void> {
    if (this.config.env.SERVICE_ROLE !== "worker") return;

    await runScheduled(this.scheduler, "recurring.reconciliation-sweep", "daily", async () => {
      const occurredSince = new Date(Date.now() - RECOVERY_LOOKBACK_DAYS * 24 * 60 * 60 * 1_000);
      const incoming = await this.transactions.systemFindRecentUnreconciledApiTransactions(
        occurredSince,
        RECOVERY_BATCH_LIMIT
      );
      let processedCount = 0;
      for (const transaction of incoming) {
        try {
          await this.reconciliation.reconcileIncoming(transaction.userId, transaction);
          processedCount += 1;
        } catch (error) {
          this.logger.error(
            {
              event: LogEvent.RecurringReconciliationSweepItemFailed,
              txnId: transaction.id,
              err: error
            },
            "recurring reconciliation sweep item failed"
          );
        }
      }
      this.logger.log(
        {
          event: LogEvent.RecurringReconciliationSweepCompleted,
          candidateCount: incoming.length,
          processedCount
        },
        "recurring reconciliation sweep completed"
      );
      return incoming.length;
    });
  }
}
