import { describe, expect, it } from "vitest";

import {
  ListBillsQuerySchema,
  ListBillStatementRowsQuerySchema,
  PayCreditCardBillSchema,
  UpdateBillStatementRowSchema
} from "./bill.js";

describe("ListBillsQuerySchema", () => {
  it("applies cursor pagination defaults", () => {
    expect(ListBillsQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("rejects a page over the maximum", () => {
    expect(ListBillsQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
  });
});

describe("ListBillStatementRowsQuerySchema", () => {
  it("parses explicit boolean query filters", () => {
    expect(ListBillStatementRowsQuerySchema.parse({ acknowledged: "true" }).acknowledged).toBe(
      true
    );
    expect(ListBillStatementRowsQuerySchema.parse({ acknowledged: "false" }).acknowledged).toBe(
      false
    );
  });
});

describe("UpdateBillStatementRowSchema", () => {
  it("accepts exactly one reconciliation action", () => {
    expect(UpdateBillStatementRowSchema.safeParse({ acknowledged: true }).success).toBe(true);
    expect(
      UpdateBillStatementRowSchema.safeParse({
        matchedTransactionId: "3fa85f64-5717-4562-b3fc-2c963f66beef"
      }).success
    ).toBe(true);
    expect(UpdateBillStatementRowSchema.safeParse({}).success).toBe(false);
    expect(
      UpdateBillStatementRowSchema.safeParse({
        acknowledged: true,
        matchedTransactionId: "3fa85f64-5717-4562-b3fc-2c963f66beef"
      }).success
    ).toBe(false);
  });
});

describe("PayCreditCardBillSchema", () => {
  it("requires positive integer paise", () => {
    const base = {
      fromAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      occurredAt: "2026-07-25T10:00:00.000Z"
    };
    expect(PayCreditCardBillSchema.safeParse({ ...base, amountMinor: 1 }).success).toBe(true);
    expect(PayCreditCardBillSchema.safeParse({ ...base, amountMinor: 1.5 }).success).toBe(false);
    expect(PayCreditCardBillSchema.safeParse({ ...base, amountMinor: 0 }).success).toBe(false);
  });
});
