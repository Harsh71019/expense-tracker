import { Body, Controller, Get, Headers, Param, Patch, Post, Res } from "@nestjs/common";
import {
  CreateRecurringRuleSchema,
  RecurringRuleIdSchema,
  UpdateRecurringRuleSchema,
  type RecurringRule
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RecurringRuleService } from "./recurring-rule.service.js";
import { RecurringRuleMutationService } from "./recurring-rule-mutation.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/recurring")
export class RecurringRuleController {
  constructor(
    private readonly rules: RecurringRuleService,
    private readonly mutations: RecurringRuleMutationService
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<RecurringRule> {
    const result = await this.mutations.create(
      user.id,
      CreateRecurringRuleSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed && response !== undefined) {
      response.status(200).setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<RecurringRule[]> {
    return this.rules.list(user.id);
  }

  @Patch(":ruleId")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("ruleId") ruleId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key?: string,
    @Res({ passthrough: true }) response?: Response
  ): Promise<RecurringRule> {
    const result = await this.mutations.update(
      user.id,
      RecurringRuleIdSchema.parse(ruleId),
      UpdateRecurringRuleSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed && response !== undefined) {
      response.setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }
}
