import { Body, Controller, Get, Headers, Param, Patch, Put, Query, Res } from "@nestjs/common";
import {
  BudgetIdSchema,
  CategoryIdSchema,
  ListBudgetsQuerySchema,
  UpsertBudgetSchema,
  type Budget,
  type BudgetPage
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { BudgetMutationService } from "./budget-mutation.service.js";
import { BudgetService } from "./budget.service.js";

const IdempotencyKeySchema = z.string().uuid();

/**
 * No @RequireScopes on any route: API-key auth stays rejected for budgets
 * until a specific scope is designed (design doc §7).
 */
@Controller("v1/budgets")
export class BudgetController {
  constructor(
    private readonly budgets: BudgetService,
    private readonly mutations: BudgetMutationService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown): Promise<BudgetPage> {
    return this.budgets.list(user.id, ListBudgetsQuerySchema.parse(query));
  }

  @Put(":categoryId")
  async upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param("categoryId") categoryId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<Budget> {
    const result = await this.mutations.upsert(
      user.id,
      CategoryIdSchema.parse(categoryId),
      UpsertBudgetSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.status(200).setHeader("Idempotency-Replayed", "true");
    return result.result;
  }

  @Patch(":budgetId/archive")
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param("budgetId") budgetId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<Budget> {
    const result = await this.mutations.archive(
      user.id,
      BudgetIdSchema.parse(budgetId),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.status(200).setHeader("Idempotency-Replayed", "true");
    return result.result;
  }
}
