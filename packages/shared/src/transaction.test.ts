import { describe, expect, it } from "vitest";

import {
  CreateTransferSchema,
  ListTransactionsQuerySchema,
  TransactionInsightsSchema,
  UpdateTransactionSchema
} from "./transaction.js";

describe("CreateTransferSchema", () => {
  it("accepts a transfer between two distinct accounts", () => {
    expect(
      CreateTransferSchema.parse({
        fromAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        toAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
        amountMinor: 10_000,
        occurredAt: "2026-07-12T09:00:00.000Z",
        description: "ATM withdrawal"
      })
    ).toMatchObject({
      fromAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      toAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
      amountMinor: 10_000,
      tags: []
    });
  });

  it("rejects a transfer where the source and destination account are the same", () => {
    expect(() =>
      CreateTransferSchema.parse({
        fromAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        toAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        amountMinor: 10_000,
        occurredAt: "2026-07-12T09:00:00.000Z",
        description: "Self transfer"
      })
    ).toThrow();
  });
});

describe("UpdateTransactionSchema", () => {
  it("accepts a patch with only tags provided", () => {
    expect(UpdateTransactionSchema.parse({ tags: ["food"] })).toEqual({ tags: ["food"] });
  });

  it("accepts an explicit null to clear the category", () => {
    expect(UpdateTransactionSchema.parse({ categoryId: null })).toEqual({ categoryId: null });
  });

  it("rejects an empty patch", () => {
    expect(() => UpdateTransactionSchema.parse({})).toThrow();
  });
});

describe("ListTransactionsQuerySchema", () => {
  it("defaults the cursor page size to 50", () => {
    expect(ListTransactionsQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("coerces date and limit query parameters", () => {
    expect(
      ListTransactionsQuerySchema.parse({ from: "2026-07-01T00:00:00.000Z", limit: "10" })
    ).toEqual({ from: new Date("2026-07-01T00:00:00.000Z"), limit: 10 });
  });

  it("rejects limits beyond the endpoint maximum", () => {
    expect(() => ListTransactionsQuerySchema.parse({ limit: "101" })).toThrow();
  });
});

describe("TransactionInsightsSchema", () => {
  it("parses the transaction-page insight read model", () => {
    expect(
      TransactionInsightsSchema.parse({
        month: "2026-08",
        monthlyTransactionCount: 3,
        dailyActivity: [{ date: "2026-08-01", transactionCount: 2 }],
        highestExpense: {
          id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
          description: "Groceries",
          amountMinor: 12_500,
          occurredAt: "2026-08-01T10:00:00.000Z"
        },
        topSpendingCategory: {
          categoryId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
          name: "Food",
          amountMinor: 20_000,
          transactionCount: 2
        },
        lifetimeTransactionCount: 42
      })
    ).toMatchObject({ month: "2026-08", monthlyTransactionCount: 3 });
  });
});
