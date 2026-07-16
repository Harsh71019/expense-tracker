import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CategoryRuleIdSchema, CreateCategoryRuleSchema, type CategoryRule } from "@vyaya/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { CategoryRuleService } from "./category-rule.service.js";

@Controller("v1/category-rules")
export class CategoryRuleController {
  constructor(private readonly rules: CategoryRuleService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<CategoryRule> {
    return this.rules.create(user.id, CreateCategoryRuleSchema.parse(body));
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<CategoryRule[]> {
    return this.rules.list(user.id);
  }

  @Delete(":ruleId")
  @HttpCode(204)
  delete(@CurrentUser() user: AuthenticatedUser, @Param("ruleId") ruleId: string): Promise<void> {
    return this.rules.delete(user.id, CategoryRuleIdSchema.parse(ruleId));
  }
}
