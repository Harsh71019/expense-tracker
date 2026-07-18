import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { CategorySchema, type Category, type CategoryId, type CreateCategory } from "@vyaya/shared";
import type { Connection } from "mongoose";
import { z } from "zod";

import { CategoryParentKindMismatchError } from "../common/errors/category-parent-kind-mismatch.error.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import {
  IdempotencyService,
  type IdempotentResult
} from "../common/idempotency/idempotency.service.js";
import { CategoryRepository } from "./category.repository.js";

@Injectable()
export class CategoryMutationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly categories: CategoryRepository,
    private readonly idempotency: IdempotencyService
  ) {}

  create(userId: string, input: CreateCategory, key: string): Promise<IdempotentResult<Category>> {
    return this.idempotency.execute(
      this.connection,
      userId,
      "category.create",
      key,
      CategorySchema,
      async (session) => {
        if (input.parentId !== undefined) {
          const parent = await this.categories.findActiveById(userId, input.parentId, session);
          if (parent === null) throw new EntityNotFoundError("Parent category");
          if (parent.kind !== input.kind) throw new CategoryParentKindMismatchError();
        }
        return this.categories.create(userId, input, session);
      }
    );
  }

  archive(userId: string, categoryId: CategoryId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(
      this.connection,
      userId,
      "category.archive",
      key,
      z.null(),
      async (session) => {
        if (!(await this.categories.archive(userId, categoryId, session))) {
          throw new EntityNotFoundError("Category");
        }
        return null;
      }
    );
  }
}
