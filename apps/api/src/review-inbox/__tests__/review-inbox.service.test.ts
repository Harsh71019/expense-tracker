import { describe, expect, it, vi } from "vitest";

import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { ReviewInboxRepository } from "../review-inbox.repository.js";
import { ReviewInboxService } from "../review-inbox.service.js";

describe("ReviewInboxService", () => {
  it("delegates list to repository with tenant-scoped query", async () => {
    const repo = focusedTestDouble<ReviewInboxRepository>({
      findPage: vi.fn().mockResolvedValue({
        items: [],
        nextCursor: null,
        totalActive: 0
      })
    });

    const service = new ReviewInboxService(repo);
    const result = await service.list("user-123", { limit: 20 });

    expect(repo.findPage).toHaveBeenCalledWith("user-123", { limit: 20 });
    expect(result.items).toHaveLength(0);
  });

  it("delegates summary to repository", async () => {
    const summaryData = {
      activeCount: 3,
      categorySuggestionCount: 1,
      recurringStreamCount: 1,
      recurringChangeCount: 1,
      spendingRegimeCount: 0,
      highestPriorityScore: 8_500,
      oldestActiveDate: "2026-08-01"
    };

    const repo = focusedTestDouble<ReviewInboxRepository>({
      getSummary: vi.fn().mockResolvedValue(summaryData)
    });

    const service = new ReviewInboxService(repo);
    const result = await service.getSummary("user-123");

    expect(repo.getSummary).toHaveBeenCalledWith("user-123");
    expect(result.activeCount).toBe(3);
    expect(result.highestPriorityScore).toBe(8_500);
  });

  it("delegates sync to repository", async () => {
    const repo = focusedTestDouble<ReviewInboxRepository>({
      syncUserInbox: vi.fn().mockResolvedValue(4)
    });

    const service = new ReviewInboxService(repo);
    const result = await service.sync("user-123");

    expect(repo.syncUserInbox).toHaveBeenCalledWith("user-123", expect.any(Date));
    expect(result.syncedCount).toBe(4);
  });
});
