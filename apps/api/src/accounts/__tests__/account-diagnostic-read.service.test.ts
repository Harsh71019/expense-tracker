import { describe, expect, it, vi } from "vitest";

import { AccountDiagnosticReadService } from "../account-diagnostic-read.service.js";

describe("AccountDiagnosticReadService", () => {
  it("aggregates active accounts, credit card only state, and liquid counts", async () => {
    const mockRows = [
      {
        id: "1",
        type: "bank",
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      },
      {
        id: "2",
        type: "credit_card",
        updatedAt: new Date("2026-08-12T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      },
      {
        id: "3",
        type: "wallet",
        updatedAt: new Date("2026-08-05T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      }
    ];

    const dbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockRows)
          })
        })
      })
    };

    // @ts-expect-error - mock database connection for unit testing
    const service = new AccountDiagnosticReadService(dbMock);
    const result = await service.getAccountDiagnosticFacts("user-1");

    expect(result.activeCount).toBe(3);
    expect(result.nonCreditCardCount).toBe(2);
    expect(result.creditCardCount).toBe(1);
    expect(result.liquidCount).toBe(2);
    expect(result.creditCardOnly).toBe(false);
    expect(result.lastUpdatedAt).toEqual(new Date("2026-08-12T00:00:00.000Z"));
  });

  it("identifies credit card only setup when no deposit or cash accounts exist", async () => {
    const mockRows = [
      {
        id: "1",
        type: "credit_card",
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z")
      }
    ];

    const dbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockRows)
          })
        })
      })
    };

    // @ts-expect-error - mock database connection for unit testing
    const service = new AccountDiagnosticReadService(dbMock);
    const result = await service.getAccountDiagnosticFacts("user-1");

    expect(result.activeCount).toBe(1);
    expect(result.nonCreditCardCount).toBe(0);
    expect(result.creditCardCount).toBe(1);
    expect(result.creditCardOnly).toBe(true);
  });
});
