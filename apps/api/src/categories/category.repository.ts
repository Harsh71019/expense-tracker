import { Inject, Injectable } from "@nestjs/common";
import {
  CategorySchema,
  type Category,
  type CategoryId,
  type CreateCategory,
  type UpdateCategory,
  type UpdateCategoryGroup
} from "@treasury-ops/shared";
import { and, eq, inArray } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import {
  budgets,
  categories,
  categoryRules,
  importBatches,
  recurringRules,
  spendingWarnings,
  stagedRows,
  transactions
} from "../common/db/schema/index.js";
import type { DbTx } from "../common/db/db-txn.js";
import { stripNulls } from "../common/db/strip-nulls.js";

@Injectable()
export class CategoryRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(userId: string, input: CreateCategory, tx?: DbTx): Promise<Category> {
    const now = new Date();
    const executor = tx ?? this.db;
    const [row] = await executor
      .insert(categories)
      .values({ userId, ...input, isArchived: false, createdAt: now, updatedAt: now })
      .returning();
    if (row === undefined) throw new Error("Category insert did not return a row.");
    return CategorySchema.parse(stripNulls(row));
  }

  async list(userId: string, includeArchived = false, tx?: DbTx): Promise<Category[]> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select()
      .from(categories)
      .where(
        includeArchived
          ? eq(categories.userId, userId)
          : and(eq(categories.userId, userId), eq(categories.isArchived, false))
      )
      .orderBy(categories.kind, categories.name);
    return rows.map((row) => CategorySchema.parse(stripNulls(row)));
  }

  archive(userId: string, categoryId: CategoryId, tx?: DbTx): Promise<boolean>;
  archive(userId: string, categoryIds: readonly CategoryId[], tx?: DbTx): Promise<number>;
  async archive(
    userId: string,
    categoryIdOrIds: CategoryId | readonly CategoryId[],
    tx?: DbTx
  ): Promise<boolean | number> {
    const categoryIds = typeof categoryIdOrIds === "string" ? [categoryIdOrIds] : categoryIdOrIds;
    if (categoryIds.length === 0) return 0;
    const executor = tx ?? this.db;
    const rows = await executor
      .update(categories)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(
        and(
          inArray(categories.id, categoryIds),
          eq(categories.userId, userId),
          eq(categories.isArchived, false)
        )
      )
      .returning({ id: categories.id });
    return typeof categoryIdOrIds === "string" ? rows.length === 1 : rows.length;
  }

  async exists(userId: string, categoryId: CategoryId, tx?: DbTx): Promise<boolean> {
    const executor = tx ?? this.db;
    const rows = await executor
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.userId, userId),
          eq(categories.isArchived, false)
        )
      );
    return rows.length > 0;
  }

  async findActiveById(
    userId: string,
    categoryId: CategoryId,
    tx?: DbTx
  ): Promise<Category | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.userId, userId),
          eq(categories.isArchived, false)
        )
      );
    return row === undefined ? null : CategorySchema.parse(stripNulls(row));
  }

  async findById(userId: string, categoryId: CategoryId, tx?: DbTx): Promise<Category | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
    return row === undefined ? null : CategorySchema.parse(stripNulls(row));
  }

  async update(
    userId: string,
    categoryId: CategoryId,
    patch: UpdateCategory,
    tx?: DbTx
  ): Promise<Category | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .update(categories)
      .set({
        name: patch.name,
        parentId: patch.parentId,
        icon: patch.icon,
        color: patch.color,
        updatedAt: new Date()
      })
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .returning();
    return row === undefined ? null : CategorySchema.parse(stripNulls(row));
  }

  async unarchive(userId: string, categoryId: CategoryId, tx?: DbTx): Promise<Category | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .update(categories)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.userId, userId),
          eq(categories.isArchived, true)
        )
      )
      .returning();
    return row === undefined ? null : CategorySchema.parse(stripNulls(row));
  }

  async hasDependents(userId: string, categoryId: CategoryId, tx?: DbTx): Promise<boolean> {
    const executor = tx ?? this.db;
    const categoryChild = await executor
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.parentId, categoryId)))
      .limit(1);
    if (categoryChild.length > 0) return true;

    const transaction = await executor
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, categoryId)))
      .limit(1);
    if (transaction.length > 0) return true;

    const budget = await executor
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)))
      .limit(1);
    if (budget.length > 0) return true;

    const categoryRule = await executor
      .select({ id: categoryRules.id })
      .from(categoryRules)
      .where(and(eq(categoryRules.userId, userId), eq(categoryRules.categoryId, categoryId)))
      .limit(1);
    if (categoryRule.length > 0) return true;

    const recurringRule = await executor
      .select({ id: recurringRules.id })
      .from(recurringRules)
      .where(
        and(eq(recurringRules.userId, userId), eq(recurringRules.templateCategoryId, categoryId))
      )
      .limit(1);
    if (recurringRule.length > 0) return true;

    const warning = await executor
      .select({ id: spendingWarnings.id })
      .from(spendingWarnings)
      .where(and(eq(spendingWarnings.userId, userId), eq(spendingWarnings.categoryId, categoryId)))
      .limit(1);
    if (warning.length > 0) return true;

    const stagedRow = await executor
      .select({ id: stagedRows.id })
      .from(stagedRows)
      .innerJoin(importBatches, eq(stagedRows.batchId, importBatches.id))
      .where(and(eq(importBatches.userId, userId), eq(stagedRows.suggestedCategoryId, categoryId)))
      .limit(1);
    return stagedRow.length > 0;
  }

  async permanentlyDelete(userId: string, categoryId: CategoryId, tx?: DbTx): Promise<boolean> {
    const executor = tx ?? this.db;
    const rows = await executor
      .delete(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.userId, userId),
          eq(categories.isArchived, true)
        )
      )
      .returning({ id: categories.id });
    return rows.length === 1;
  }

  async updateGroup(
    userId: string,
    categoryId: CategoryId,
    patch: UpdateCategoryGroup,
    tx?: DbTx
  ): Promise<Category | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .update(categories)
      .set({ group: patch.group, updatedAt: new Date() })
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.userId, userId),
          eq(categories.isArchived, false)
        )
      )
      .returning();
    return row === undefined ? null : CategorySchema.parse(stripNulls(row));
  }
}
