import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res
} from "@nestjs/common";
import {
  CreateGoalContributionSchema,
  CreateGoalSchema,
  GoalIdSchema,
  ListGoalsQuerySchema,
  ReorderGoalsSchema,
  UpdateGoalSchema,
  type Goal,
  type GoalContribution,
  type GoalPlan
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { GoalMutationService } from "./goal-mutation.service.js";
import { GoalService } from "./goal.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/goals")
export class GoalController {
  constructor(
    private readonly goals: GoalService,
    private readonly mutations: GoalMutationService
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<Goal> {
    const result = await this.mutations.create(
      user.id,
      CreateGoalSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    } else {
      response.setHeader("Location", `/api/v1/goals/${result.result.id}`);
    }
    return result.result;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown): Promise<Goal[]> {
    const parsed = ListGoalsQuerySchema.parse(query);
    return this.goals.list(user.id, parsed.status);
  }

  @Patch("reorder")
  @HttpCode(204)
  async reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const result = await this.mutations.reorder(
      user.id,
      ReorderGoalsSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
  }

  @Patch(":goalId")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("goalId") goalId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<Goal> {
    const result = await this.mutations.update(
      user.id,
      GoalIdSchema.parse(goalId),
      UpdateGoalSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
    return result.result;
  }

  @Post(":goalId/abandon")
  @HttpCode(204)
  async abandon(
    @CurrentUser() user: AuthenticatedUser,
    @Param("goalId") goalId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const result = await this.mutations.abandon(
      user.id,
      GoalIdSchema.parse(goalId),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
  }

  @Post(":goalId/contributions")
  async recordContribution(
    @CurrentUser() user: AuthenticatedUser,
    @Param("goalId") goalId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<Goal> {
    const result = await this.mutations.recordContribution(
      user.id,
      GoalIdSchema.parse(goalId),
      CreateGoalContributionSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
    return result.result;
  }

  @Get(":goalId/contributions")
  listContributions(
    @CurrentUser() user: AuthenticatedUser,
    @Param("goalId") goalId: string
  ): Promise<GoalContribution[]> {
    return this.goals.listContributions(user.id, GoalIdSchema.parse(goalId));
  }

  @Get(":goalId/plan")
  plan(@CurrentUser() user: AuthenticatedUser, @Param("goalId") goalId: string): Promise<GoalPlan> {
    return this.goals.getPlan(user.id, GoalIdSchema.parse(goalId));
  }

  @Get(":goalId")
  get(@CurrentUser() user: AuthenticatedUser, @Param("goalId") goalId: string): Promise<Goal> {
    return this.goals.get(user.id, GoalIdSchema.parse(goalId));
  }
}
