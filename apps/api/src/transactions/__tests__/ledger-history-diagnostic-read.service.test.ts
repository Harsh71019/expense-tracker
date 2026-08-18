import { describe, expect, it, vi } from "vitest";

import { LedgerHistoryDiagnosticReadService } from "../ledger-history-diagnostic-read.service.js";

describe("LedgerHistoryDiagnosticReadService", () => {
  it("groups qualifying essential expenses by IST month and excludes current partial month", async () => {
    const asOf = new Date("2026-08-18T10:00:00.000Z"); // current month: 2026-08

    const mockRows = [
      {
        month: "2026-08",
        transactionCount: 1,
        latestExpenseAt: new Date("2026-08-05T00:00:00.000Z"),
        oldestExpenseAt: new Date("2026-08-05T00:00:00.000Z")
      },
      {
        month: "2026-07",
        transactionCount: 2,
        latestExpenseAt: new Date("2026-07-20T00:00:00.000Z"),
        oldestExpenseAt: new Date("2026-07-05T00:00:00.000Z")
      },
      {
        month: "2026-06",
        transactionCount: 1,
        latestExpenseAt: new Date("2026-06-15T00:00:00.000Z"),
        oldestExpenseAt: new Date("2026-06-15T00:00:00.000Z")
      },
      {
        month: "2026-05",
        transactionCount: 1,
        latestExpenseAt: new Date("2026-05-10T00:00:00.000Z"),
        oldestExpenseAt: new Date("2026-05-10T00:00:00.000Z")
      }
    ];

    const dbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockResolvedValue(mockRows)
            })
          })
        })
      })
    };

    // @ts-expect-error - mock database connection for unit testing
    const service = new LedgerHistoryDiagnosticReadService(dbMock);
    const result = await service.getLedgerHistoryDiagnosticFacts("user-1", asOf);

    expect(result.qualifyingTransactionCount).toBe(5);
    expect(result.hasCurrentMonthExpenses).toBe(true);
    expect(result.completeMonthCount).toBe(3); // 2026-05, 2026-06, 2026-07
    expect(result.months).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(result.latestExpenseAt).toEqual(new Date("2026-08-05T00:00:00.000Z"));
    expect(result.oldestExpenseAt).toEqual(new Date("2026-05-10T00:00:00.000Z"));
  });
});
