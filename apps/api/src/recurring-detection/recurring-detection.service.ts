import { Injectable } from "@nestjs/common";
import type { RecurringDetectionRunResult } from "@treasury-ops/shared";

import { MetricsService } from "../common/observability/metrics.service.js";
import { detectRecurringStreams } from "./detect-recurring-streams.js";
import { RecurringDetectionRepository } from "./recurring-detection.repository.js";

@Injectable()
export class RecurringDetectionService {
  constructor(
    private readonly repository: RecurringDetectionRepository,
    private readonly metrics: MetricsService
  ) {}

  /** Worker-only tenant-scoped shadow computation. No ledger or recurring-rule writes occur. */
  async analyzeUser(userId: string, asOf: Date): Promise<RecurringDetectionRunResult> {
    const startedAt = new Date();
    const history = await this.repository.findBoundedHistory(userId, asOf);
    const detection = detectRecurringStreams(history.rows, userId, asOf, {
      rowBudgetHit: history.rowBudgetHit
    });
    const started = await this.repository.beginOrResumeRun(
      userId,
      asOf,
      detection.summary,
      startedAt
    );
    if (started.alreadyFinal) return started.result;

    try {
      for (const stream of detection.streams) {
        await this.repository.persistStreamRevision(userId, started.result.id, stream, asOf);
      }
      const completed = await this.repository.completeRun(
        userId,
        started.result.id,
        detection.summary,
        new Date()
      );
      if (completed.status === "running" || completed.status === "failed") {
        throw new Error("Recurring detection completion returned a non-final status.");
      }
      await this.metrics.recordRecurringDetectionRun(
        completed.status,
        completed.totalStreamCount,
        completed.abstainedGroupCount,
        completed.resources
      );
      return completed;
    } catch (error: unknown) {
      await this.repository.markRunFailed(userId, started.result.id, "runtime_error");
      await this.metrics.recordRecurringDetectionRun(
        "failed",
        detection.streams.length,
        detection.summary.abstainedGroupCount,
        detection.summary.resources
      );
      throw error;
    }
  }
}
