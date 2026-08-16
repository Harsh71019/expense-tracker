import { describe, expect, it } from "vitest";

import {
  DismissReviewItemRequestSchema,
  DismissReviewItemResponseSchema,
  ListReviewInboxQuerySchema,
  ReviewInboxPageSchema,
  ReviewInboxSummarySchema,
  ReviewItemPriorityFactorsSchema,
  ReviewItemSchema,
  SubmitReviewFeedbackRequestSchema,
  SubmitReviewFeedbackResponseSchema
} from "./review-inbox.js";

describe("Review Inbox Schemas", () => {
  const dummyItem = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-test-01",
    sourceType: "recurring_change",
    sourceId: "22222222-2222-4222-8222-222222222222",
    sourceVersion: 1,
    status: "active",
    priorityScore: 7_500,
    priorityFactors: {
      uncertaintyBps: 2_000,
      amountSignificanceBps: 3_000,
      downstreamImpactBps: 8_000,
      stalenessBps: 500,
      compositeScore: 7_500,
      explanation: "Recurring price shift (+300 INR) with 3 recent occurrences"
    },
    title: "Recurring Price Increase",
    subtitle: "Subscription changed from 499 INR to 799 INR",
    amountMinor: 79_900,
    confidenceBps: 8_000,
    evidence: { oldMedianMinor: 49_900, newMedianMinor: 79_900 },
    inputWatermark: { asOf: "2026-08-01T00:00:00.000Z", digest: "a".repeat(64) },
    supersedesItemId: null,
    occurredAt: new Date("2026-08-01T00:00:00.000Z"),
    dismissedAt: null,
    dismissReason: null,
    resolvedAt: null,
    feedbackAction: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z")
  };

  it("validates ReviewItemSchema", () => {
    const parsed = ReviewItemSchema.parse(dummyItem);
    expect(parsed.id).toBe(dummyItem.id);
    expect(parsed.priorityScore).toBe(7_500);
  });

  it("validates ReviewItemPriorityFactorsSchema", () => {
    expect(ReviewItemPriorityFactorsSchema.parse(dummyItem.priorityFactors)).toBeDefined();
  });

  it("validates ReviewInboxSummarySchema", () => {
    const summary = {
      activeCount: 5,
      categorySuggestionCount: 2,
      recurringStreamCount: 1,
      recurringChangeCount: 1,
      spendingRegimeCount: 1,
      highestPriorityScore: 8_200,
      oldestActiveDate: "2026-07-15"
    };
    expect(ReviewInboxSummarySchema.parse(summary)).toEqual(summary);
  });

  it("validates ListReviewInboxQuerySchema", () => {
    expect(ListReviewInboxQuerySchema.parse({})).toEqual({
      limit: 50,
      status: "active"
    });
    expect(ListReviewInboxQuerySchema.parse({ limit: "25", status: "dismissed" })).toEqual({
      limit: 25,
      status: "dismissed"
    });
  });

  it("validates ReviewInboxPageSchema", () => {
    const page = {
      items: [dummyItem],
      nextCursor: "cursor-token-123",
      totalActive: 1
    };
    expect(ReviewInboxPageSchema.parse(page)).toBeDefined();
  });

  it("validates DismissReviewItemRequestSchema & Response", () => {
    expect(DismissReviewItemRequestSchema.parse({})).toEqual({
      reason: "not_relevant"
    });
    expect(DismissReviewItemResponseSchema.parse({ item: dummyItem })).toBeDefined();
  });

  it("validates SubmitReviewFeedbackRequestSchema & Response", () => {
    const feedback = {
      action: "accepted",
      feedbackRating: 5,
      notes: "Accurate detection"
    };
    expect(SubmitReviewFeedbackRequestSchema.parse(feedback)).toEqual(feedback);
    expect(
      SubmitReviewFeedbackResponseSchema.parse({
        item: dummyItem,
        feedbackRecorded: true
      })
    ).toBeDefined();
  });
});
