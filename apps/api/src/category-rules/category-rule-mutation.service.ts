import { Injectable } from "@nestjs/common";
import {
  CategoryRuleSchema,
  type CategoryRule,
  type CategoryRuleId,
  type CreateCategoryRule
} from "@vyaya/shared";
import { z } from "zod";

import { CategoryRepository } from "../categories/category.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { IdempotencyPostgresService } from "../common/idempotency/idempotency-postgres.service.js";
import type { IdempotentResult } from "../common/idempotency/idempotency-postgres.service.js";
import { CategoryRuleRepository } from "./category-rule.repository.js";

@Injectable()
export class CategoryRuleMutationService {
  constructor(
    private readonly rules: CategoryRuleRepository,
    private readonly categories: CategoryRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  create(
    userId: string,
    input: CreateCategoryRule,
    key: string
  ): Promise<IdempotentResult<CategoryRule>> {
    return this.idempotency.execute(
      userId,
      "category-rule.create",
      key,
      CategoryRuleSchema,
      async (tx) => {
        if (!(await this.categories.exists(userId, input.categoryId, tx))) {
          throw new EntityNotFoundError("Category");
        }
        return this.rules.create(userId, input, tx);
      }
    );
  }

  delete(userId: string, ruleId: CategoryRuleId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(userId, "category-rule.delete", key, z.null(), async (tx) => {
      if (!(await this.rules.delete(userId, ruleId, tx))) {
        throw new EntityNotFoundError("Category rule");
      }
      return null;
    });
  }
}
