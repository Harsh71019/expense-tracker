import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ReviewInboxPage as ReviewInboxPageData,
  ReviewInboxSummary,
  ReviewItem
} from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { ReviewInboxPage } from "../components/review-inbox-page";

const { mockPush, mockRefresh, mockPost, mockGet, mockToastError, mockToastSuccess } = vi.hoisted(
  () => ({
    mockPush: vi.fn(),
    mockRefresh: vi.fn(),
    mockPost: vi.fn(),
    mockGet: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn()
  })
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    POST: mockPost,
    GET: mockGet
  }
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess
  }
}));

describe("ReviewInboxPage", () => {
  const dummyItem: ReviewItem = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-test",
    sourceType: "recurring_change",
    sourceId: "22222222-2222-4222-8222-222222222222",
    sourceVersion: 1,
    status: "active",
    priorityScore: 7_800,
    priorityFactors: {
      uncertaintyBps: 2_000,
      amountSignificanceBps: 3_000,
      downstreamImpactBps: 8_500,
      stalenessBps: 500,
      compositeScore: 7_800,
      explanation: "Recurring price shift detected"
    },
    title: "Recurring Cost Increase",
    subtitle: "Subscription changed from ₹499 to ₹799",
    amountMinor: 79_900,
    confidenceBps: 8_000,
    evidence: { oldMedianMinor: 49_900, newMedianMinor: 79_900 },
    inputWatermark: { asOf: new Date("2026-08-01"), rowCount: 5, digest: "a".repeat(64) },
    supersedesItemId: null,
    occurredAt: new Date("2026-08-01"),
    dismissedAt: null,
    dismissReason: null,
    resolvedAt: null,
    feedbackAction: null,
    createdAt: new Date("2026-08-01"),
    updatedAt: new Date("2026-08-01")
  };

  const dummySummary: ReviewInboxSummary = {
    activeCount: 1,
    categorySuggestionCount: 0,
    recurringStreamCount: 0,
    recurringChangeCount: 1,
    spendingRegimeCount: 0,
    highestPriorityScore: 7_800,
    oldestActiveDate: "2026-08-01"
  };

  it("renders page header, stat cards, and review item card", () => {
    const pageData: ReviewInboxPageData = {
      items: [dummyItem],
      nextCursor: null,
      totalActive: 1
    };

    render(
      <ReviewInboxPage
        initialPage={pageData}
        summary={dummySummary}
        filters={{ filter: "all", status: "active" }}
      />
    );

    expect(screen.getByText("Personal Review Inbox")).toBeDefined();
    expect(screen.getByText("Recurring Cost Increase")).toBeDefined();
    expect(screen.getByText("Subscription changed from ₹499 to ₹799")).toBeDefined();
    expect(screen.getByText("₹799.00")).toBeDefined();
    expect(screen.getByText("80% confidence")).toBeDefined();
  });

  it("renders empty state when there are no items", () => {
    const emptyPage: ReviewInboxPageData = {
      items: [],
      nextCursor: null,
      totalActive: 0
    };

    render(
      <ReviewInboxPage
        initialPage={emptyPage}
        summary={{ ...dummySummary, activeCount: 0 }}
        filters={{ filter: "all", status: "active" }}
      />
    );

    expect(screen.getByTestId("review-inbox-empty")).toBeDefined();
    expect(screen.getByText("Review inbox is all clear")).toBeDefined();
  });

  it("toggles priority factors breakdown on click", async () => {
    const user = userEvent.setup();
    const pageData: ReviewInboxPageData = {
      items: [dummyItem],
      nextCursor: null,
      totalActive: 1
    };

    render(
      <ReviewInboxPage
        initialPage={pageData}
        summary={dummySummary}
        filters={{ filter: "all", status: "active" }}
      />
    );

    expect(screen.queryByTestId("priority-factors-panel")).toBeNull();

    const toggleBtn = screen.getByText("Why was this prioritized? ▼");
    await user.click(toggleBtn);

    expect(screen.getByTestId("priority-factors-panel")).toBeDefined();
    expect(screen.getByText("Recurring price shift detected")).toBeDefined();
  });

  it("triggers dismiss API on clicking dismiss button", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce({
      data: {
        item: { ...dummyItem, status: "dismissed" }
      }
    });

    const pageData: ReviewInboxPageData = {
      items: [dummyItem],
      nextCursor: null,
      totalActive: 1
    };

    render(
      <ReviewInboxPage
        initialPage={pageData}
        summary={dummySummary}
        filters={{ filter: "all", status: "active" }}
      />
    );

    const dismissBtn = screen.getByRole("button", { name: "Dismiss" });
    await user.click(dismissBtn);

    expect(mockPost).toHaveBeenCalledWith(
      "/v1/review-inbox/{id}/dismiss",
      expect.objectContaining({
        params: expect.objectContaining({
          path: { id: dummyItem.id }
        }),
        body: { reason: "not_relevant" }
      })
    );
  });

  it("appends the next page when load more succeeds", async () => {
    const user = userEvent.setup();
    const secondItem: ReviewItem = {
      ...dummyItem,
      id: "22222222-2222-4222-8222-222222222222",
      title: "Second Review Item"
    };

    mockGet.mockResolvedValueOnce({
      data: {
        items: [secondItem],
        nextCursor: null,
        totalActive: 2
      }
    });

    const pageData: ReviewInboxPageData = {
      items: [dummyItem],
      nextCursor: "cursor-page-2",
      totalActive: 2
    };

    render(
      <ReviewInboxPage
        initialPage={pageData}
        summary={dummySummary}
        filters={{ filter: "all", status: "active" }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Load Next Page →" }));

    expect(mockGet).toHaveBeenCalledWith(
      "/v1/review-inbox",
      expect.objectContaining({
        params: expect.objectContaining({
          query: expect.objectContaining({
            cursor: "cursor-page-2"
          })
        })
      })
    );
    expect(screen.getByText("Second Review Item")).toBeDefined();
  });

  it("shows a toast when sync fails", async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValueOnce({
      error: { title: "Sync failed" },
      response: { status: 500 }
    });

    const pageData: ReviewInboxPageData = {
      items: [dummyItem],
      nextCursor: null,
      totalActive: 1
    };

    render(
      <ReviewInboxPage
        initialPage={pageData}
        summary={dummySummary}
        filters={{ filter: "all", status: "active" }}
      />
    );

    await user.click(screen.getByRole("button", { name: "Sync review items ↻" }));

    expect(mockToastError).toHaveBeenCalled();
  });
});
