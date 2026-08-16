import type { HttpHandler } from "msw";
import { http, HttpResponse } from "msw";

export function reviewInboxHandlers(): HttpHandler[] {
  return [
    http.get("*/api/v1/review-inbox", () => {
      return HttpResponse.json({
        items: [],
        nextCursor: null,
        totalActive: 0
      });
    }),
    http.get("*/api/v1/review-inbox/summary", () => {
      return HttpResponse.json({
        activeCount: 0,
        categorySuggestionCount: 0,
        recurringStreamCount: 0,
        recurringChangeCount: 0,
        spendingRegimeCount: 0,
        highestPriorityScore: null,
        oldestActiveDate: null
      });
    }),
    http.post("*/api/v1/review-inbox/sync", () => {
      return HttpResponse.json({ syncedCount: 0 });
    }),
    http.post("*/api/v1/review-inbox/:id/dismiss", () => {
      return HttpResponse.json({
        item: {
          id: "11111111-1111-4111-8111-111111111111",
          userId: "mock-user",
          sourceType: "category_suggestion",
          sourceId: "mock-source",
          sourceVersion: 1,
          status: "dismissed",
          priorityScore: 5_000,
          priorityFactors: {
            uncertaintyBps: 2000,
            amountSignificanceBps: 1000,
            downstreamImpactBps: 4000,
            stalenessBps: 0,
            compositeScore: 5000,
            explanation: "Mock dismissed"
          },
          title: "Dismissed Item",
          subtitle: "Dismissed item subtitle",
          amountMinor: 10_000,
          confidenceBps: 8_000,
          evidence: {},
          inputWatermark: {},
          supersedesItemId: null,
          occurredAt: new Date().toISOString(),
          dismissedAt: new Date().toISOString(),
          dismissReason: "not_relevant",
          resolvedAt: null,
          feedbackAction: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }),
    http.post("*/api/v1/review-inbox/:id/feedback", () => {
      return HttpResponse.json({
        item: {
          id: "11111111-1111-4111-8111-111111111111",
          userId: "mock-user",
          sourceType: "category_suggestion",
          sourceId: "mock-source",
          sourceVersion: 1,
          status: "resolved",
          priorityScore: 5_000,
          priorityFactors: {
            uncertaintyBps: 2000,
            amountSignificanceBps: 1000,
            downstreamImpactBps: 4000,
            stalenessBps: 0,
            compositeScore: 5000,
            explanation: "Mock resolved"
          },
          title: "Resolved Item",
          subtitle: "Resolved item subtitle",
          amountMinor: 10_000,
          confidenceBps: 8_000,
          evidence: {},
          inputWatermark: {},
          supersedesItemId: null,
          occurredAt: new Date().toISOString(),
          dismissedAt: null,
          dismissReason: null,
          resolvedAt: new Date().toISOString(),
          feedbackAction: "accepted",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        feedbackRecorded: true
      });
    })
  ];
}
