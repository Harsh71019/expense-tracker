import { Injectable } from "@nestjs/common";
import { buildCategoryRollupNodes, type Month, type MonthlyReport } from "@treasury-ops/shared";

import { CategoryRepository } from "../categories/category.repository.js";
import { MonthlyRollupService } from "./monthly-rollup.service.js";

/**
 * Stored rollups keep per-category direct amounts; the hierarchy is applied
 * here on every read. Keeping it out of the cache means their meaning, and so
 * MONTHLY_ROLLUP_FORMULA_VERSION, is unchanged, and moving a category takes
 * effect without invalidating any month. Archived categories are included so
 * that their historical spend stays in its parent's total.
 */
@Injectable()
export class MonthlyReportService {
  constructor(
    private readonly rollups: MonthlyRollupService,
    private readonly categories: CategoryRepository
  ) {}

  async getReport(userId: string, month: Month): Promise<MonthlyReport | null> {
    const rollup = await this.rollups.getOrCompute(userId, month);
    if (rollup === null) return null;
    const categories = await this.categories.list(userId, true);
    return {
      ...rollup,
      consumptionTree: buildCategoryRollupNodes(categories, rollup.consumptionByCategory)
    };
  }
}
