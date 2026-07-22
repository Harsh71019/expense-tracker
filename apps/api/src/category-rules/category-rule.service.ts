import { Injectable } from "@nestjs/common";
import type { CategoryRule, CategoryRuleId, CreateCategoryRule } from "@treasury-ops/shared";

import { CategoryRepository } from "../categories/category.repository.js";
import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { CategoryRuleRepository } from "./category-rule.repository.js";

@Injectable()
export class CategoryRuleService {
  constructor(
    private readonly rules: CategoryRuleRepository,
    private readonly categories: CategoryRepository
  ) {}

  async create(userId: string, input: CreateCategoryRule): Promise<CategoryRule> {
    const categories = await this.categories.list(userId);
    if (!categories.some((category) => category.id === input.categoryId)) {
      throw new EntityNotFoundError("Category");
    }
    return this.rules.create(userId, input);
  }

  list(userId: string): Promise<CategoryRule[]> {
    return this.rules.list(userId);
  }

  async delete(userId: string, ruleId: CategoryRuleId): Promise<void> {
    if (!(await this.rules.delete(userId, ruleId))) {
      throw new EntityNotFoundError("Category rule");
    }
  }
}
