import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Res } from "@nestjs/common";
import {
  CategoryRuleIdSchema,
  CreateCategoryRuleSchema,
  type CategoryRule
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { CategoryRuleService } from "./category-rule.service.js";
import { CategoryRuleMutationService } from "./category-rule-mutation.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/category-rules")
export class CategoryRuleController {
  constructor(
    private readonly rules: CategoryRuleService,
    private readonly mutations?: CategoryRuleMutationService
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<CategoryRule> {
    const input = CreateCategoryRuleSchema.parse(body);
    if (this.mutations === undefined) return this.rules.create(user.id, input);
    const result = await this.mutations.create(user.id, input, IdempotencyKeySchema.parse(key));
    if (result.replayed && response !== undefined) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<CategoryRule[]> {
    return this.rules.list(user.id);
  }

  @Delete(":ruleId")
  @HttpCode(204)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("ruleId") ruleId: string,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<void> {
    const parsedId = CategoryRuleIdSchema.parse(ruleId);
    if (this.mutations === undefined) return this.rules.delete(user.id, parsedId);
    const result = await this.mutations.delete(user.id, parsedId, IdempotencyKeySchema.parse(key));
    if (result.replayed && response !== undefined) {
      response.setHeader("Idempotency-Replayed", "true");
    }
  }
}
