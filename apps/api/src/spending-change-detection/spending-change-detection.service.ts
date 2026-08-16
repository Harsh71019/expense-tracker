import { Injectable } from "@nestjs/common";
import type { SpendingChangeDetectionRunResult } from "@treasury-ops/shared";

import { MetricsService } from "../common/observability/metrics.service.js";
import { detectSpendingChanges } from "./detect-spending-changes.js";
import { SpendingChangeDetectionRepository } from "./spending-change-detection.repository.js";

@Injectable()
export class SpendingChangeDetectionService {
  constructor(
    private readonly repository: SpendingChangeDetectionRepository,
    private readonly metrics: MetricsService
  ) {}

  /** Worker-only tenant-scoped shadow computation. No ledger writes or recurring rule edits occur. */
  async analyzeUser(userId: string, asOf: Date): Promise<SpendingChangeDetectionRunResult> {
    const startedAt = new Date();
    const history = await this.repository.findBoundedHistory(userId, asOf);
    const matureStreams = await this.repository.findMatureStreams(userId);

    const detection = detectSpendingChanges(history.rows, matureStreams, userId, asOf, {
      rowBudgetHit: history.rowBudgetHit
    });

    const started = await this.repository.beginOrResumeRun(
      userId,
      asOf,
      detection.watermark,
      detection.sufficiency,
      detection.resources,
      startedAt
    );

    if (started.alreadyFinal) {
      return started.result;
    }

    try {
      // 1. Persist recurring amount changes and derived streams
      await this.repository.persistDerivedStreamChanges(userId, detection.recurringChanges, asOf);

      // 2. Persist spending regimes
      await this.repository.persistSpendingRegimes(userId, detection.spendingRegimes);

      // 3. Mark run completed
      const completed = await this.repository.completeRun(
        userId,
        started.result.id,
        {
          recurringChangesCount: detection.recurringChanges.length,
          regimesCount: detection.spendingRegimes.length,
          abstainedCount: detection.abstainedCount,
          status: detection.resources.outcome.status,
          sufficiency: detection.sufficiency,
          resources: detection.resources
        },
        new Date()
      );

      if (completed.status === "running" || completed.status === "failed") {
        throw new Error("Spending change completion returned a non-final status.");
      }

      await this.metrics.recordSpendingChangeDetectionRun(
        completed.status,
        completed.recurringChangesCount,
        completed.regimesCount,
        completed.abstainedCount,
        completed.resources
      );

      return completed;
    } catch (error: unknown) {
      await this.repository.markRunFailed(userId, started.result.id, "runtime_error");
      await this.metrics.recordSpendingChangeDetectionRun(
        "failed",
        detection.recurringChanges.length,
        detection.spendingRegimes.length,
        detection.abstainedCount,
        detection.resources
      );
      throw error;
    }
  }
}
