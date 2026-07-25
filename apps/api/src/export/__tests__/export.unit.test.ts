import { describe, expect, it, vi } from "vitest";

import { ExportService } from "../export.service.js";

describe("ExportService Unit Tests", () => {
  it("generates neutralized CSV from posted transactions across pages", async () => {
    const mockTransactions = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce({
          items: [
            {
              id: "tx_1",
              accountId: "acc_1",
              categoryId: "cat_1",
              type: "expense",
              status: "posted",
              amountMinor: 5000,
              occurredAt: new Date("2026-01-01T10:00:00Z"),
              description: "=SUM(1+1)",
              tags: ["tag1", "tag2"]
            }
          ],
          pageInfo: { hasMore: true, nextCursor: "cur_1" }
        })
        .mockResolvedValueOnce({
          items: [
            {
              id: "tx_2",
              accountId: "acc_1",
              type: "income",
              status: "posted",
              amountMinor: 10000,
              occurredAt: new Date("2026-01-02T10:00:00Z"),
              description: "Salary",
              tags: []
            }
          ],
          pageInfo: { hasMore: false, nextCursor: null }
        })
    };

    const mockAccounts = {
      list: vi.fn(async () => [{ id: "acc_1", name: "Checking" }])
    };

    const mockCategories = {
      list: vi.fn(async () => [{ id: "cat_1", name: "Food" }])
    };

    // @ts-expect-error mock service args
    const service = new ExportService(mockTransactions, mockAccounts, mockCategories);
    const csv = await service.generateCsv("u1", {});

    expect(csv).toContain("Date,Type,Status,Account,Category,Description,Tags,Amount (INR)");
    expect(csv).toContain("Checking");
    expect(csv).toContain("Food");
    expect(csv).toContain("'=SUM(1+1)"); // neutralized formula injection
    expect(csv).toContain("-₹50.00");
    expect(csv).toContain("₹100.00");
  });
});
