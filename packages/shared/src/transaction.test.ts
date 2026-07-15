import { describe, expect, it } from "vitest";

import {
  CreateTransferSchema,
  ListTransactionsQuerySchema,
  UpdateTransactionSchema
} from "./transaction.js";

describe("CreateTransferSchema", () => {
  it("accepts a transfer between two distinct accounts", () => {
    expect(
      CreateTransferSchema.parse({
        fromAccountId: "507f1f77bcf86cd799439011",
        toAccountId: "507f1f77bcf86cd799439012",
        amountMinor: 10_000,
        occurredAt: "2026-07-12T09:00:00.000Z",
        description: "ATM withdrawal"
      })
    ).toMatchObject({
      fromAccountId: "507f1f77bcf86cd799439011",
      toAccountId: "507f1f77bcf86cd799439012",
      amountMinor: 10_000,
      tags: []
    });
  });

  it("rejects a transfer where the source and destination account are the same", () => {
    expect(() =>
      CreateTransferSchema.parse({
        fromAccountId: "507f1f77bcf86cd799439011",
        toAccountId: "507f1f77bcf86cd799439011",
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
