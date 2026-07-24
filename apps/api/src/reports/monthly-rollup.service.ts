import { Injectable } from "@nestjs/common";
import type { Month, MonthlyRollup } from "@treasury-ops/shared";

import { toISTMonth } from "../common/time/ist.js";
import { MonthlyRollupRepository } from "./monthly-rollup.repository.js";

@Injectable()
export class MonthlyRollupService {
  constructor(private readonly rollups: MonthlyRollupRepository) {}

  /**
   * Cache read with lazy backfill: a month with no cron-written row is
   * computed on first request (and cached from then on) rather than 404ing,
   * as long as it isn't in the future -- RollupsRefreshService only ever
   * keeps the current + previous month warm, so any older month a
   * dashboard view needs would otherwise never resolve. `Month` ("YYYY-MM")
   * sorts correctly as a plain string comparison.
   */
  async getOrCompute(userId: string, month: Month): Promise<MonthlyRollup | null> {
    const existing = await this.rollups.findByMonth(userId, month);
    if (existing !== null) return existing;
    if (month > toISTMonth(new Date())) return null;
    return this.rollups.recompute(userId, month);
  }
}
