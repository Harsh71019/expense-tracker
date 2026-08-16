import { Injectable } from "@nestjs/common";
import type {
  ListReviewInboxQuery,
  ReviewInboxPage,
  ReviewInboxSummary
} from "@treasury-ops/shared";

import { ReviewInboxRepository } from "./review-inbox.repository.js";

@Injectable()
export class ReviewInboxService {
  constructor(private readonly repository: ReviewInboxRepository) {}

  list(userId: string, query: ListReviewInboxQuery): Promise<ReviewInboxPage> {
    return this.repository.findPage(userId, query);
  }

  getSummary(userId: string): Promise<ReviewInboxSummary> {
    return this.repository.getSummary(userId);
  }

  async sync(userId: string, asOf = new Date()): Promise<{ syncedCount: number }> {
    const syncedCount = await this.repository.syncUserInbox(userId, asOf);
    return { syncedCount };
  }
}
