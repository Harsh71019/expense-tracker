import { Body, Controller, Get, Headers, Param, Post, Query, Res } from "@nestjs/common";
import {
  AcceptDetectedStreamSchema,
  DetectedRecurringStreamIdSchema,
  ListDetectedStreamsQuerySchema,
  RejectDetectedStreamSchema,
  type DetectedStreamPage,
  type DetectedStreamReview,
  type RecurringRule
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RecurringDetectionReviewService } from "./recurring-detection-review.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/recurring/detected")
export class RecurringDetectionReviewController {
  constructor(private readonly reviews: RecurringDetectionReviewService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<DetectedStreamPage> {
    return this.reviews.list(user.id, ListDetectedStreamsQuerySchema.parse(query));
  }

  @Post(":streamId/accept")
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param("streamId") streamId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response | undefined
  ): Promise<RecurringRule> {
    const result = await this.reviews.accept(
      user.id,
      DetectedRecurringStreamIdSchema.parse(streamId),
      AcceptDetectedStreamSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed && response !== undefined)
      response.setHeader("Idempotency-Replayed", "true");
    return result.result;
  }

  @Post(":streamId/reject")
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("streamId") streamId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response | undefined
  ): Promise<DetectedStreamReview> {
    const result = await this.reviews.reject(
      user.id,
      DetectedRecurringStreamIdSchema.parse(streamId),
      IdempotencyKeySchema.parse(key)
    );
    RejectDetectedStreamSchema.parse(body);
    if (result.replayed && response !== undefined)
      response.setHeader("Idempotency-Replayed", "true");
    return result.result;
  }
}
