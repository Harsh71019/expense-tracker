import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  CreateRecurringRuleSchema,
  RecurringRuleIdSchema,
  UpdateRecurringRuleSchema,
  type RecurringRule
} from "@vyaya/shared";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RecurringRuleService } from "./recurring-rule.service.js";

@Controller("v1/recurring")
export class RecurringRuleController {
  constructor(private readonly rules: RecurringRuleService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<RecurringRule> {
    return this.rules.create(user.id, CreateRecurringRuleSchema.parse(body));
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<RecurringRule[]> {
    return this.rules.list(user.id);
  }

  @Patch(":ruleId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("ruleId") ruleId: string,
    @Body() body: unknown
  ): Promise<RecurringRule> {
    return this.rules.update(
      user.id,
      RecurringRuleIdSchema.parse(ruleId),
      UpdateRecurringRuleSchema.parse(body)
    );
  }
}
