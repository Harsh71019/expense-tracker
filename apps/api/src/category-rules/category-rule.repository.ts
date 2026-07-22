import { Inject, Injectable } from "@nestjs/common";
import {
  CategoryRuleSchema,
  type CategoryRule,
  type CategoryRuleId,
  type CreateCategoryRule
} from "@treasury-ops/shared";
import { and, eq } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { categoryRules } from "../common/db/schema/index.js";
import type { DbTx } from "../common/db/db-txn.js";

@Injectable()
export class CategoryRuleRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(userId: string, input: CreateCategoryRule, tx?: DbTx): Promise<CategoryRule> {
    const now = new Date();
    const executor = tx ?? this.db;
    const [row] = await executor
      .insert(categoryRules)
      .values({
        userId,
        pattern: input.pattern,
        categoryId: input.categoryId,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    return CategoryRuleSchema.parse(row);
  }

  async list(userId: string): Promise<CategoryRule[]> {
    const rows = await this.db
      .select()
      .from(categoryRules)
      .where(eq(categoryRules.userId, userId))
      .orderBy(categoryRules.pattern);
    return rows.map((row) => CategoryRuleSchema.parse(row));
  }

  async delete(userId: string, ruleId: CategoryRuleId, tx?: DbTx): Promise<boolean> {
    const executor = tx ?? this.db;
    const rows = await executor
      .delete(categoryRules)
      .where(and(eq(categoryRules.id, ruleId), eq(categoryRules.userId, userId)))
      .returning({ id: categoryRules.id });
    return rows.length === 1;
  }
}
