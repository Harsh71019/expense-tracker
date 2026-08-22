import { Body, Controller, Header, HttpCode, Post, Res } from "@nestjs/common";
import {
  CategoryRecommendationQuerySchema,
  type CategoryRecommendationResponse
} from "@treasury-ops/shared";
import type { Response } from "express";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { CategorySuggestionService } from "./category-suggestion.service.js";

@Controller("v1/category-recommendations")
export class CategoryRecommendationController {
  constructor(private readonly suggestions: CategorySuggestionService) {}

  @Post("query")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  query(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) response?: Response
  ): Promise<CategoryRecommendationResponse> {
    const input = CategoryRecommendationQuerySchema.parse(body);
    response?.setHeader("Cache-Control", "no-store");
    return this.suggestions.recommendForPicker(user.id, {
      type: input.type,
      occurredAt: new Date(input.occurredAt),
      limit: input.limit,
      ...(input.description === undefined ? {} : { description: input.description })
    });
  }
}
