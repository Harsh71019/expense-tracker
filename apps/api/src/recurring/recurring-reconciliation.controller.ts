import { Body, Controller, Get, Headers, Param, Post, Query, Res } from "@nestjs/common";
import {
  ListRecurringReconciliationsQuerySchema,
  RecurringReconciliationIdSchema,
  ResolveRecurringReconciliationSchema,
  type RecurringReconciliation
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RecurringReconciliationService } from "./recurring-reconciliation.service.js";

const IdempotencyKeySchema = z.string().uuid();

/**
 * Human-facing review queue for exceptions the recurring reconciliation
 * matcher couldn't resolve on its own (ambiguous or amount-mismatched
 * candidates) -- session auth only, never callable with an API key.
 */
@Controller("v1/recurring/reconciliations")
export class RecurringReconciliationController {
  constructor(private readonly reconciliations: RecurringReconciliationService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<RecurringReconciliation[]> {
    ListRecurringReconciliationsQuerySchema.parse(query);
    return this.reconciliations.listPending(user.id);
  }

  @Post(":id/resolve")
  async resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<RecurringReconciliation> {
    const result = await this.reconciliations.resolve(
      user.id,
      RecurringReconciliationIdSchema.parse(id),
      ResolveRecurringReconciliationSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
    return result.result;
  }
}
