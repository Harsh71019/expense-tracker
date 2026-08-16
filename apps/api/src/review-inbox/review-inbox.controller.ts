import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import {
  DismissReviewItemRequestSchema,
  ListReviewInboxQuerySchema,
  ReviewItemIdSchema,
  SubmitReviewFeedbackRequestSchema,
  type DismissReviewItemResponse,
  type ReviewInboxPage,
  type ReviewInboxSummary,
  type SubmitReviewFeedbackResponse
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ReviewInboxMutationService } from "./review-inbox-mutation.service.js";
import { ReviewInboxService } from "./review-inbox.service.js";

const IdempotencyKeySchema = z.string().uuid();

@Controller("v1/review-inbox")
export class ReviewInboxController {
  constructor(
    private readonly inbox: ReviewInboxService,
    private readonly mutations: ReviewInboxMutationService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown): Promise<ReviewInboxPage> {
    return this.inbox.list(user.id, ListReviewInboxQuerySchema.parse(query));
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthenticatedUser): Promise<ReviewInboxSummary> {
    return this.inbox.getSummary(user.id);
  }

  @Post("sync")
  @HttpCode(200)
  sync(@CurrentUser() user: AuthenticatedUser): Promise<{ syncedCount: number }> {
    return this.inbox.sync(user.id);
  }

  @Post(":id/dismiss")
  @HttpCode(200)
  async dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<DismissReviewItemResponse> {
    const parsedBody = DismissReviewItemRequestSchema.parse(body ?? {});
    const result = await this.mutations.dismiss(
      user.id,
      ReviewItemIdSchema.parse(id),
      parsedBody.reason,
      IdempotencyKeySchema.parse(key)
    );
    if (result.replayed) {
      response.setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }

  @Post(":id/feedback")
  @HttpCode(200)
  async feedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<SubmitReviewFeedbackResponse> {
    const parsedBody = SubmitReviewFeedbackRequestSchema.parse(body);
    const result = await this.mutations.feedback(
      user.id,
      ReviewItemIdSchema.parse(id),
      parsedBody.action,
      IdempotencyKeySchema.parse(key),
      parsedBody.feedbackRating,
      parsedBody.notes
    );
    if (result.replayed) {
      response.setHeader("Idempotency-Replayed", "true");
    }
    return result.result;
  }
}
