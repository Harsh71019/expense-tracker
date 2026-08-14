import { describe, expect, it } from "vitest";

import {
  CreateCreditCardPaymentSchema,
  ListBillsQuerySchema,
  ListBillStatementRowsQuerySchema,
  PayCreditCardBillSchema,
  StatementAssignmentSuggestionSchema,
  UpdateBillStatementRowSchema
} from "./bill.js";

describe("CreateCreditCardPaymentSchema", () => {
  it("requires an existing transaction and target card while keeping bill attribution optional", () => {
    const input = {
      transactionId: "3fa85f64-5717-4562-b3fc-2c963f66be01",
      creditCardAccountId: "3fa85f64-5717-4562-b3fc-2c963f66be02"
    };
    expect(CreateCreditCardPaymentSchema.safeParse(input).success).toBe(true);
    expect(
      CreateCreditCardPaymentSchema.safeParse({
        ...input,
        billId: "3fa85f64-5717-4562-b3fc-2c963f66be03"
      }).success
    ).toBe(true);
    expect(
      CreateCreditCardPaymentSchema.safeParse({ ...input, creditCardAccountId: "not-a-uuid" })
        .success
    ).toBe(false);
  });
});

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

describe("StatementAssignmentSuggestionSchema", () => {
  it("requires versioned, opaque, integer reconciliation evidence", () => {
    const input = {
      confidenceBps: 9_000,
      method: "global_assignment_v1",
      evidence: {
        candidateCount: 1,
        selectedTransactionId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
        dateDistanceDays: 0,
        descriptionSimilarityBps: 10_000,
        dateCost: 0,
        textCost: 0,
        sourcePenalty: 0,
        assignedCost: 0,
        unmatchedCost: 15_000,
        alternativeCost: 15_000,
        assignmentMarginCost: 15_000
      },
      sufficiency: { status: "sufficient", candidateCount: 1 },
      algorithmVersion: 1,
      inputWatermark: "a".repeat(64)
    };
    expect(StatementAssignmentSuggestionSchema.safeParse(input).success).toBe(true);
    expect(
      StatementAssignmentSuggestionSchema.safeParse({
        ...input,
        evidence: { ...input.evidence, descriptionSimilarityBps: 10_001 }
      }).success
    ).toBe(false);
    expect(
      StatementAssignmentSuggestionSchema.safeParse({ ...input, inputWatermark: "not-a-hash" })
        .success
    ).toBe(false);
  });
});
