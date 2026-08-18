import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { goals } from "../common/db/schema/index.js";

export const GoalDiagnosticFactsSchema = z.object({
  activeGoalCount: z.number().int().min(0),
  totalGoalCount: z.number().int().min(0),
  hasActiveGoals: z.boolean(),
  lastUpdatedAt: z.coerce.date().nullable()
});

export type GoalDiagnosticFacts = z.infer<typeof GoalDiagnosticFactsSchema>;

/**
 * Tenant-scoped narrow read port for goal facts consumed by the financial
 * readiness diagnostic. Read-only by construction; returns parsed domain facts
 * rather than raw Drizzle rows.
 */
@Injectable()
export class GoalDiagnosticReadService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async getGoalDiagnosticFacts(userId: string): Promise<GoalDiagnosticFacts> {
    const rows = await this.db
      .select({
        id: goals.id,
        status: goals.status,
        updatedAt: goals.updatedAt,
        createdAt: goals.createdAt
      })
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(desc(goals.updatedAt));

    const totalGoalCount = rows.length;
    let activeGoalCount = 0;
    let latestTimestamp: Date | null = null;

    for (const row of rows) {
      if (row.status === "active") {
        activeGoalCount += 1;
      }

      const rowTs = row.updatedAt ?? row.createdAt;
      if (rowTs && (latestTimestamp === null || rowTs > latestTimestamp)) {
        latestTimestamp = rowTs;
      }
    }

    return GoalDiagnosticFactsSchema.parse({
      activeGoalCount,
      totalGoalCount,
      hasActiveGoals: activeGoalCount > 0,
      lastUpdatedAt: latestTimestamp
    });
  }
}
