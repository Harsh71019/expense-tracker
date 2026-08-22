import { describe, expect, it } from "vitest";

import {
  BatchCategorizeTransactionsResultSchema,
  BatchCategorizeTransactionsSchema,
  CreateTransactionSchema,
  CreateTransferSchema,
  ListTransactionsQuerySchema,
  TransactionSchema,
  TransactionInsightsSchema,
  UpdateTransactionSchema
} from "./transaction.js";

const TRANSACTION_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const ACCOUNT_ID = "3fa85f64-5717-4562-b3fc-2c963f66beff";

describe("TransactionSchema", () => {
  const transaction = {
    id: TRANSACTION_ID,
    userId: "user-1",
    accountId: ACCOUNT_ID,
    type: "expense",
    amountMinor: 10_000,
    occurredAt: "2026-08-02T09:00:00.000Z",
    description: "RTGS/DR/UTR:HDFC0000000001/ACME RENTALS",
    tags: [],
    currency: "INR",
    source: "api",
    status: "posted",
    paymentRail: "rtgs",
    counterpartyHandle: null,
    createdAt: "2026-08-02T09:00:00.000Z",
    updatedAt: "2026-08-02T09:00:00.000Z"
  };

  it("accepts required derived payment context on transaction responses", () => {
    expect(TransactionSchema.parse(transaction)).toMatchObject({
      paymentRail: "rtgs",
      counterpartyHandle: null
    });
  });

  it("rejects transaction responses without derived payment context", () => {
    const missing = { ...transaction, paymentRail: undefined, counterpartyHandle: undefined };
    expect(() => TransactionSchema.parse(missing)).toThrow();
  });

  it("keeps create requests backward compatible and ignores response-only fields", () => {
    expect(
      CreateTransactionSchema.parse({
        accountId: ACCOUNT_ID,
        type: "expense",
        amountMinor: 10_000,
        occurredAt: "2026-08-02T09:00:00.000Z",
        description: "Rent",
        paymentRail: "rtgs"
      })
    ).toEqual({
      accountId: ACCOUNT_ID,
      type: "expense",
      amountMinor: 10_000,
      occurredAt: new Date("2026-08-02T09:00:00.000Z"),
      description: "Rent",
      tags: []
    });
  });
});

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

describe("BatchCategorizeTransactionsSchema", () => {
  const transactionId = "3fa85f64-5717-4562-b3fc-2c963f66beef";
  const categoryId = "3fa85f64-5717-4562-b3fc-2c963f66be99";

  it("accepts a bounded set of unique transaction ids", () => {
    expect(
      BatchCategorizeTransactionsSchema.parse({ transactionIds: [transactionId], categoryId })
    ).toEqual({ transactionIds: [transactionId], categoryId });
    expect(
      BatchCategorizeTransactionsResultSchema.parse({
        transactionIds: [transactionId],
        categoryId,
        updatedCount: 1
      })
    ).toEqual({ transactionIds: [transactionId], categoryId, updatedCount: 1 });
  });

  it("rejects empty, duplicate, and oversized batches", () => {
    expect(
      BatchCategorizeTransactionsSchema.safeParse({ transactionIds: [], categoryId }).success
    ).toBe(false);
    expect(
      BatchCategorizeTransactionsSchema.safeParse({
        transactionIds: [transactionId, transactionId],
        categoryId
      }).success
    ).toBe(false);
    expect(
      BatchCategorizeTransactionsSchema.safeParse({
        transactionIds: Array.from(
          { length: 201 },
          (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
        ),
        categoryId
      }).success
    ).toBe(false);
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

  it("parses the uncategorized query filter and rejects a conflicting category", () => {
    expect(ListTransactionsQuerySchema.parse({ uncategorized: "true" })).toEqual({
      uncategorized: true,
      limit: 50
    });
    expect(() =>
      ListTransactionsQuerySchema.parse({
        categoryId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        uncategorized: "true"
      })
    ).toThrow();
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
