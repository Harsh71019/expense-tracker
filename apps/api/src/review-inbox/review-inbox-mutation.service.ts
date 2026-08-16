import { Injectable } from "@nestjs/common";
import {
  DismissReviewItemResponseSchema,
  SubmitReviewFeedbackResponseSchema,
  type DismissReviewItemResponse,
  type ReviewItemDismissReason,
  type ReviewItemFeedbackAction,
  type SubmitReviewFeedbackResponse
} from "@treasury-ops/shared";

import { IdempotencyPostgresService } from "../common/idempotency/idempotency-postgres.service.js";
import type { IdempotentResult } from "../common/idempotency/idempotency-postgres.service.js";
import { ReviewInboxRepository } from "./review-inbox.repository.js";

@Injectable()
export class ReviewInboxMutationService {
  constructor(
    private readonly repository: ReviewInboxRepository,
    private readonly idempotency: IdempotencyPostgresService
  ) {}

  dismiss(
    userId: string,
    itemId: string,
    reason: ReviewItemDismissReason,
    key: string
  ): Promise<IdempotentResult<DismissReviewItemResponse>> {
    return this.idempotency.execute(
      userId,
      "review_inbox.dismiss",
      key,
      { itemId, reason },
      DismissReviewItemResponseSchema,
      async (tx) => {
        const item = await this.repository.dismissInTx(userId, itemId, reason, tx);
        return { item };
      }
    );
  }

  feedback(
    userId: string,
    itemId: string,
    action: ReviewItemFeedbackAction,
    key: string,
    rating?: number,
    notes?: string
  ): Promise<IdempotentResult<SubmitReviewFeedbackResponse>> {
    return this.idempotency.execute(
      userId,
      "review_inbox.feedback",
      key,
      { itemId, action, rating, notes },
      SubmitReviewFeedbackResponseSchema,
      async (tx) => {
        const item = await this.repository.submitFeedbackInTx(userId, itemId, action, tx);
        return { item, feedbackRecorded: true };
      }
    );
  }
}
