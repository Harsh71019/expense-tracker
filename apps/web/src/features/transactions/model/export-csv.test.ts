import type { Account, Category, Transaction } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { generateTransactionsCsv } from "./export-csv";

const transaction: Transaction = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
  type: "expense",
  amountMinor: 450_00,
  occurredAt: new Date("2026-08-14T10:00:00.000Z"),
  description: "=SUM(A1:A10)",
  tags: ["food", "lunch"],
  currency: "INR",
  source: "manual",
  status: "posted",
  paymentRail: "upi",
  counterpartyHandle: null,
  createdAt: new Date("2026-08-14T10:00:00.000Z"),
  updatedAt: new Date("2026-08-14T10:00:00.000Z")
};

const account: Account = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
  userId: "user-1",
  name: "HDFC Bank",
  type: "bank",
  currency: "INR",
  balanceMinor: 100_000_00,
  openingBalanceMinor: 100_000_00,
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const category: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be00",
  userId: "user-1",
  name: "Food & Dining",
  kind: "expense",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("generateTransactionsCsv", () => {
  it("generates CSV headers and neutralizes formula injection on description", () => {
    const csv = generateTransactionsCsv(
      [{ ...transaction, categoryId: category.id }],
      new Map([[category.id, category]]),
      new Map([[account.id, account]])
    );

    expect(csv).toContain("Transaction ID,Date (ISO),Date (India)");
    // Formula starting with = should be prefixed with single quote
    expect(csv).toContain("'=SUM(A1:A10)");
    expect(csv).toContain("Food & Dining");
    expect(csv).toContain("HDFC Bank");
    expect(csv).toContain("food;lunch");
  });
});
