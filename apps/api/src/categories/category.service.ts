import { Injectable } from "@nestjs/common";
import type { Category, CategoryId, CreateCategory } from "@vyaya/shared";

import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { CategoryRepository } from "./category.repository.js";

@Injectable()
export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}
  create(userId: string, input: CreateCategory): Promise<Category> {
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
