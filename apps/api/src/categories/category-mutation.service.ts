import { Injectable } from "@nestjs/common";
import { CategorySchema, type Category, type CategoryId, type CreateCategory } from "@vyaya/shared";
import { z } from "zod";

import { CategoryParentKindMismatchError } from "../common/errors/category-parent-kind-mismatch.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import {
  IdempotencyPostgresService,
  type IdempotentResult
} from "../common/idempotency/idempotency-postgres.service.js";
import { CategoryRepository } from "./category.repository.js";

@Injectable()
export class CategoryMutationService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  create(userId: string, input: CreateCategory, key: string): Promise<IdempotentResult<Category>> {
    return this.idempotency.execute(userId, "category.create", key, CategorySchema, async (tx) => {
      if (input.parentId !== undefined) {
        const parent = await this.categories.findActiveById(userId, input.parentId, tx);
        if (parent === null) throw new EntityNotFoundError("Parent category");
        if (parent.kind !== input.kind) throw new CategoryParentKindMismatchError();
      }
      return this.categories.create(userId, input, tx);
    });
  }

  archive(userId: string, categoryId: CategoryId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(userId, "category.archive", key, z.null(), async (tx) => {
      if (!(await this.categories.archive(userId, categoryId, tx))) {
        throw new EntityNotFoundError("Category");
      }
      return null;
    });
  }
}
