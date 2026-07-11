import { Body, Controller, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { CategoryIdSchema, CreateCategorySchema, type Category } from "@vyaya/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { CategoryService } from "./category.service.js";

@Controller("v1/categories")
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<Category> {
    return this.categories.create(user.id, CreateCategorySchema.parse(body));
  }
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Category[]> {
    return this.categories.list(user.id);
  }
  @Patch(":categoryId/archive")
  @HttpCode(204)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("categoryId") categoryId: string
  ): Promise<void> {
    return this.categories.archive(user.id, CategoryIdSchema.parse(categoryId));
  }
}
