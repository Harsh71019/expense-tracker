import { Body, Controller, Get, Headers, Param, Post, Query, Res } from "@nestjs/common";
import {
  LinkRecurringOccurrencePaymentSchema,
  ListRecurringOccurrencesQuerySchema,
  RecurringRuleIdSchema,
  RecurringOccurrenceIdSchema,
  type RecurringOccurrence,
  type RecurringOccurrencePage
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RecurringOccurrenceService } from "./recurring-occurrence.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/recurring")
export class RecurringOccurrenceController {
  constructor(private readonly occurrences: RecurringOccurrenceService) {}

  @Get("occurrences/outstanding")
  listOutstanding(@CurrentUser() user: AuthenticatedUser): Promise<RecurringOccurrence[]> {
    return this.occurrences.listOutstanding(user.id);
  }

  @Get(":ruleId/occurrences")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("ruleId") ruleId: string,
    @Query() query: unknown
  ): Promise<RecurringOccurrencePage> {
    return this.occurrences.list(
      user.id,
      RecurringRuleIdSchema.parse(ruleId),
      ListRecurringOccurrencesQuerySchema.parse(query)
    );
  }

  @Post(":ruleId/occurrences/:occurrenceId/link-payment")
  async linkPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("ruleId") ruleId: string,
    @Param("occurrenceId") occurrenceId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<RecurringOccurrence> {
    const result = await this.occurrences.linkPayment(
      user.id,
      RecurringRuleIdSchema.parse(ruleId),
      RecurringOccurrenceIdSchema.parse(occurrenceId),
      LinkRecurringOccurrencePaymentSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
    return result.result;
  }
}
