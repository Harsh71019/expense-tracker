import { Injectable } from "@nestjs/common";
import type { Category, CategoryId, CreateCategory } from "@vyaya/shared";

import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { CategoryParentKindMismatchError } from "../common/errors/category-parent-kind-mismatch.error.js";
import { CategoryRepository } from "./category.repository.js";

@Injectable()
export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}
  async create(userId: string, input: CreateCategory): Promise<Category> {
    if (input.parentId !== undefined) {
      const parent = await this.categories.findActiveById(userId, input.parentId);
      if (parent === null) throw new EntityNotFoundError("Parent category");
      if (parent.kind !== input.kind) throw new CategoryParentKindMismatchError();
    }
    return this.categories.create(userId, input);
  }
  list(userId: string): Promise<Category[]> {
    return this.categories.list(userId);
  }
  async archive(userId: string, categoryId: CategoryId): Promise<void> {
    if (!(await this.categories.archive(userId, categoryId)))
      throw new EntityNotFoundError("Category");
  }
}
