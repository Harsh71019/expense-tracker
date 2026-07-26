import { Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import {
  ListSpendingWarningsQuerySchema,
  SpendingWarningIdSchema,
  type DismissSpendingWarningResponse,
  type SpendingWarningPage
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SpendingWarningsMutationService } from "./spending-warnings-mutation.service.js";
import { SpendingWarningsService } from "./spending-warnings.service.js";

const IdempotencyKeySchema = z.string().uuid();

/**
 * Read-only list + idempotent dismiss only (plan §7). There is
 * deliberately no synchronous "refresh now" route — a page request must
 * never start an analytical scan; only the worker's daily cron computes
 * warnings (spending-warnings-schedule.service.ts).
 */
@Controller("v1/spending-warnings")
export class SpendingWarningsController {
  constructor(
    private readonly warnings: SpendingWarningsService,
    private readonly mutations: SpendingWarningsMutationService
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<SpendingWarningPage> {
    return this.warnings.list(user.id, ListSpendingWarningsQuerySchema.parse(query));
  }

  @Post(":warningId/dismiss")
  @HttpCode(200)
  async dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param("warningId") warningId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<DismissSpendingWarningResponse> {
    const result = await this.mutations.dismiss(
      user.id,
      SpendingWarningIdSchema.parse(warningId),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) {
      response.setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }
}
