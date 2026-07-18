import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import {
  CategoryRuleSchema,
  type CategoryRule,
  type CategoryRuleId,
  type CreateCategoryRule
} from "@vyaya/shared";
import type { Connection } from "mongoose";
import { z } from "zod";

import { CategoryRepository } from "../categories/category.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import {
  IdempotencyService,
  type IdempotentResult
} from "../common/idempotency/idempotency.service.js";
import { CategoryRuleRepository } from "./category-rule.repository.js";

@Injectable()
export class CategoryRuleMutationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly rules: CategoryRuleRepository,
    private readonly categories: CategoryRepository,
    private readonly idempotency: IdempotencyService
  ) {}

  create(
    userId: string,
    input: CreateCategoryRule,
    key: string
  ): Promise<IdempotentResult<CategoryRule>> {
    return this.idempotency.execute(
      this.connection,
      userId,
      "category-rule.create",
      key,
      CategoryRuleSchema,
      async (session) => {
        // categories is already Postgres-backed (Task 10) while this transaction is
        // still Mongo -- out-of-transaction read, not participating in the transaction
        // below; resolved once this repository is itself ported to Postgres.
        if (!(await this.categories.exists(userId, input.categoryId))) {
          throw new EntityNotFoundError("Category");
        }
        return this.rules.create(userId, input, session);
      }
    );
  }

  delete(userId: string, ruleId: CategoryRuleId, key: string): Promise<IdempotentResult<null>> {
    return this.idempotency.execute(
      this.connection,
      userId,
      "category-rule.delete",
      key,
      z.null(),
      async (session) => {
        if (!(await this.rules.delete(userId, ruleId, session))) {
          throw new EntityNotFoundError("Category rule");
        }
        return null;
      }
    );
  }
}
