import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Res } from "@nestjs/common";
import { CategoryIdSchema, CreateCategorySchema, type Category } from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequireScopes } from "../auth/require-scopes.decorator.js";
import { CategoryService } from "./category.service.js";
import { CategoryMutationService } from "./category-mutation.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/categories")
export class CategoryController {
  constructor(
    private readonly categories: CategoryService,
    private readonly mutations?: CategoryMutationService
  ) {}
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<Category> {
    const input = CreateCategorySchema.parse(body);
    if (this.mutations === undefined) return this.categories.create(user.id, input);
    const result = await this.mutations.create(user.id, input, IdempotencyKeySchema.parse(key));
    if (result.replayed && response !== undefined) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }
  @Get()
  @RequireScopes({ categories: ["read"] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Category[]> {
    return this.categories.list(user.id);
  }
  @Patch(":categoryId/archive")
  @HttpCode(204)
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("categoryId") categoryId: string,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<void> {
    const parsedId = CategoryIdSchema.parse(categoryId);
    if (this.mutations === undefined) return this.categories.archive(user.id, parsedId);
    const result = await this.mutations.archive(user.id, parsedId, IdempotencyKeySchema.parse(key));
    if (result.replayed && response !== undefined) {
      response.setHeader("Idempotency-Replayed", "true");
    }
  }
}
