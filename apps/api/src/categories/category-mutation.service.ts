import { Injectable } from "@nestjs/common";
import {
  CategorySchema,
  type Category,
  type CategoryId,
  type CreateCategory,
  type UpdateCategory,
  type UpdateCategoryGroup
} from "@treasury-ops/shared";
import { z } from "zod";

import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { CategoryRepository } from "./category.repository.js";
import { CategoryService } from "./category.service.js";

@Injectable()
export class CategoryMutationService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly idempotency: IdempotencyPostgresService,
    private readonly categoryService: CategoryService
  ) {}

  create(userId: string, input: CreateCategory, key: string): Promise<IdempotentResult<Category>> {
    return this.idempotency.execute(userId, "category.create", key, input, CategorySchema, (tx) =>
      this.categoryService.create(userId, input, tx)
    );
  }

  archive(userId: string, categoryId: CategoryId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(
      userId,
      "category.archive",
      key,
      { categoryId },
      z.null(),
      async (tx) => {
        await this.categoryService.archive(userId, categoryId, tx);
        return null;
      }
    );
  }

  update(
    userId: string,
    categoryId: CategoryId,
    patch: UpdateCategory,
    key: string
  ): Promise<IdempotentResult<Category>> {
    return this.idempotency.execute(
      userId,
      "category.update",
      key,
      { categoryId, patch },
      CategorySchema,
      (tx) => this.categoryService.update(userId, categoryId, patch, tx)
    );
  }

  unarchive(
    userId: string,
    categoryId: CategoryId,
    key: string
  ): Promise<IdempotentResult<Category>> {
    return this.idempotency.execute(
      userId,
      "category.unarchive",
      key,
      { categoryId },
      CategorySchema,
      (tx) => this.categoryService.unarchive(userId, categoryId, tx)
    );
  }

  permanentlyDelete(
    userId: string,
    categoryId: CategoryId,
    key: string
  ): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(
      userId,
      "category.permanent_delete",
      key,
      { categoryId },
      z.null(),
      async (tx) => {
        await this.categoryService.permanentlyDelete(userId, categoryId, tx);
        return null;
      }
    );
  }

  updateGroup(
    userId: string,
    categoryId: CategoryId,
    patch: UpdateCategoryGroup,
    key: string
  ): Promise<IdempotentResult<Category>> {
    return this.idempotency.execute(
      userId,
      "category.update_group",
      key,
      { categoryId, patch },
      CategorySchema,
      async (tx) => {
        const updated = await this.categories.updateGroup(userId, categoryId, patch, tx);
        if (updated === null) throw new EntityNotFoundError("Category");
        return updated;
      }
    );
  }
}
