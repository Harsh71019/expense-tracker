import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { categories } from "../common/db/schema/index.js";

export const CategoryDiagnosticFactsSchema = z.object({
  activeExpenseCategoryCount: z.number().int().min(0),
  essentialExpenseCategoryCount: z.number().int().min(0),
  totalActiveCategoryCount: z.number().int().min(0),
  lastUpdatedAt: z.coerce.date().nullable()
});

export type CategoryDiagnosticFacts = z.infer<typeof CategoryDiagnosticFactsSchema>;

/**
 * Tenant-scoped narrow read port for category facts consumed by the financial
 * readiness diagnostic. Read-only by construction; returns parsed domain facts
 * rather than raw Drizzle rows.
 */
@Injectable()
export class CategoryDiagnosticReadService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async getCategoryDiagnosticFacts(userId: string): Promise<CategoryDiagnosticFacts> {
    const rows = await this.db
      .select({
        id: categories.id,
        kind: categories.kind,
        group: categories.group,
        updatedAt: categories.updatedAt,
        createdAt: categories.createdAt
      })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.isArchived, false)))
      .orderBy(desc(categories.updatedAt));

    const totalActiveCategoryCount = rows.length;
    let activeExpenseCategoryCount = 0;
    let essentialExpenseCategoryCount = 0;
    let latestTimestamp: Date | null = null;

    for (const row of rows) {
      if (row.kind === "expense") {
        activeExpenseCategoryCount += 1;
        if (row.group === "essential") {
          essentialExpenseCategoryCount += 1;
        }
      }

      const rowTs = row.updatedAt ?? row.createdAt;
      if (rowTs && (latestTimestamp === null || rowTs > latestTimestamp)) {
        latestTimestamp = rowTs;
      }
    }

    return CategoryDiagnosticFactsSchema.parse({
      activeExpenseCategoryCount,
      essentialExpenseCategoryCount,
      totalActiveCategoryCount,
      lastUpdatedAt: latestTimestamp
    });
  }
}
