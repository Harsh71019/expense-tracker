import { describe, expect, it, vi } from "vitest";

import { ExportService } from "../export.service.js";

describe("ExportService Extra Unit Tests", () => {
  it("generates CSV including multi-page pagination and neutralizing formula injection", async () => {
    const page1Tx = {
      id: "tx_1",
      accountId: "acc_1",
      categoryId: "cat_1",
      type: "expense" as const,
      status: "posted" as const,
      amountMinor: 5000,
      occurredAt: new Date("2026-01-01"),
      description: "=SUM(A1:A10)",
      tags: ["tag1", "tag2"]
    };

    const page2Tx = {
      id: "tx_2",
      accountId: "acc_1",
      type: "income" as const,
      status: "posted" as const,
      amountMinor: 10000,
      occurredAt: new Date("2026-01-02"),
      description: "Salary",
      tags: []
    };

    const mockTransactions = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce({
          items: [page1Tx],
          pageInfo: { hasMore: true, nextCursor: "cursor_1" }
        })
        .mockResolvedValueOnce({
          items: [page2Tx],
          pageInfo: { hasMore: false, nextCursor: null }
        })
    };

    const mockAccounts = {
      list: vi.fn(async () => [{ id: "acc_1", name: "+Bank" }])
    };

    const mockCategories = {
      list: vi.fn(async () => [{ id: "cat_1", name: "Food" }])
    };

    // @ts-expect-error mock service args
    const service = new ExportService(mockTransactions, mockAccounts, mockCategories);
    const csv = await service.generateCsv("u1", {});

    expect(csv).toContain("Date,Type,Status,Account,Category,Description,Tags,Amount (INR)");
    expect(csv).toContain("'+Bank"); // Neutralized formula injection with single quote
    expect(csv).toContain("'=SUM(A1:A10)");
    expect(csv).toContain("-₹50.00");
    expect(csv).toContain("₹100.00");
  });
});
