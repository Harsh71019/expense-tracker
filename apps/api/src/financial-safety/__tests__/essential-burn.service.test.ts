import { describe, expect, it, vi } from "vitest";

import { EssentialBurnService } from "../essential-burn.service.js";
import type { EssentialBurnRepository } from "../essential-burn.repository.js";
import type { MonthlyLedgerExpenseFacts } from "../essential-burn.js";

describe("EssentialBurnService", () => {
  it("orchestrates candidate month resolution, queries repository, and returns parsed result", async () => {
    const asOf = new Date("2026-08-18T10:00:00.000Z");
    const mockFacts = new Map<string, MonthlyLedgerExpenseFacts>([
      [
        "2026-05",
        {
          month: "2026-05",
          eligibleExpenseCount: 5,
          totalExpenseMinor: 50_000,
          essentialCount: 3,
          essentialMinor: 30_000,
          lifestyleCount: 2,
          lifestyleMinor: 20_000,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ],
      [
        "2026-06",
        {
          month: "2026-06",
          eligibleExpenseCount: 6,
          totalExpenseMinor: 60_000,
          essentialCount: 4,
          essentialMinor: 40_000,
          lifestyleCount: 2,
          lifestyleMinor: 20_000,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ],
      [
        "2026-07",
        {
          month: "2026-07",
          eligibleExpenseCount: 7,
          totalExpenseMinor: 70_000,
          essentialCount: 5,
          essentialMinor: 50_000,
          lifestyleCount: 2,
          lifestyleMinor: 20_000,
          uncategorizedCount: 0,
          uncategorizedMinor: 0,
          ungroupedCount: 0,
          ungroupedMinor: 0
        }
      ]
    ]);

    const mockRepo: Partial<EssentialBurnRepository> = {
      getMonthlyLedgerExpenseFacts: vi.fn().mockResolvedValue(mockFacts)
    };

    const loggedEvents: unknown[] = [];
    const mockLogger = {
      log: (event: unknown) => loggedEvents.push(event),
      error: () => {},
      warn: () => {}
    };

    const service = new EssentialBurnService(
      mockLogger,
      // @ts-expect-error - mock EssentialBurnRepository for unit testing
      mockRepo
    );

    const result = await service.getEssentialBurn("user-1", asOf);

    expect(mockRepo.getMonthlyLedgerExpenseFacts).toHaveBeenCalledWith(
      "user-1",
      ["2026-05", "2026-06", "2026-07"],
      "2026-08"
    );

    expect(result.quality).toBe("complete");
    expect(result.observedCompleteMonthCount).toBe(3);
    // (30000 + 40000 + 50000) / 3 = 40000
    expect(result.averageMonthlyEssentialMinor).toBe(40_000);

    // Verify logger did NOT log any money amounts
    expect(loggedEvents).toHaveLength(1);
    const event = loggedEvents[0];
    expect(event).toBeDefined();
    if (typeof event === "object" && event !== null) {
      expect(event).toHaveProperty("event", "essential_burn.calculated");
      expect(event).toHaveProperty("userId", "user-1");
      expect(event).toHaveProperty("quality", "complete");
      expect(event).not.toHaveProperty("averageMonthlyEssentialMinor");
      expect(event).not.toHaveProperty("amountMinor");
    }
  });
});
