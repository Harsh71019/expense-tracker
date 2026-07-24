import { Inject, Injectable } from "@nestjs/common";
import {
  CategorySchema,
  type Category,
  type CategoryId,
  type CreateCategory,
  type UpdateCategoryGroup
} from "@treasury-ops/shared";
import { and, eq } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { categories } from "../common/db/schema/index.js";
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

  async list(userId: string): Promise<Category[]> {
    const rows = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.isArchived, false)))
      .orderBy(categories.kind, categories.name);
    return rows.map((row) => CategorySchema.parse(stripNulls(row)));
  }

  async archive(userId: string, categoryId: CategoryId, tx?: DbTx): Promise<boolean> {
    const executor = tx ?? this.db;
    const rows = await executor
      .update(categories)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.userId, userId),
          eq(categories.isArchived, false)
        )
      )
      .returning({ id: categories.id });
    return rows.length === 1;
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
