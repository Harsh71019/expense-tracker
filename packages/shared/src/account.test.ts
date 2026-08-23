import { describe, expect, it } from "vitest";

import {
  AccountInsightsQuerySchema,
  AccountInsightsSchema,
  CreateAccountSchema
} from "./account.js";

describe("CreateAccountSchema credit-card configuration", () => {
  it("accepts cycle configuration for a credit card", () => {
    expect(
      CreateAccountSchema.safeParse({
        name: "HDFC Card",
        type: "credit_card",
        openingBalanceMinor: 0,
        creditCardConfig: { statementDay: 25, dueDay: 15 }
      }).success
    ).toBe(true);
  });

  it("keeps legacy credit-card creation valid without configuration", () => {
    expect(
      CreateAccountSchema.safeParse({
        name: "Legacy Card",
        type: "credit_card",
        openingBalanceMinor: 0
      }).success
    ).toBe(true);
  });

  it("rejects cycle configuration for non-card accounts", () => {
    expect(
      CreateAccountSchema.safeParse({
        name: "Bank",
        type: "bank",
        openingBalanceMinor: 0,
        creditCardConfig: { statementDay: 25, dueDay: 15 }
      }).success
    ).toBe(false);
  });
});

describe("AccountInsights schemas", () => {
  it("defaults the requested range to 30 days and rejects unsupported ranges", () => {
    expect(AccountInsightsQuerySchema.parse({})).toEqual({ range: "30d" });
    expect(AccountInsightsQuerySchema.parse({ range: "1y" })).toEqual({ range: "1y" });
    expect(AccountInsightsQuerySchema.safeParse({ range: "7d" }).success).toBe(false);
  });

  it("parses a signed balance series and account-scoped movement summary", () => {
    const parsed = AccountInsightsSchema.parse({
      range: "30d",
      from: "2026-07-25T18:30:00.000Z",
      to: "2026-08-24T18:29:59.999Z",
      bucket: "day",
      summary: {
        incomeMinor: 25_000,
        expenseMinor: 40_000,
        netMinor: -15_000,
        transactionCount: 4
      },
      balanceSeries: [{ period: "2026-08-23", balanceMinor: -5_000 }],
      cashflowSeries: [{ period: "2026-08-23", incomeMinor: 5_000, expenseMinor: 20_000 }],
      spendingByCategory: [
        {
          categoryId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
          name: "Food",
          color: "#16A34A",
          amountMinor: 20_000,
          transactionCount: 2
        }
      ]
    });

    expect(parsed.balanceSeries[0]?.balanceMinor).toBe(-5_000);
    expect(parsed.from).toBeInstanceOf(Date);
  });

  it("rejects unsafe money and malformed period keys", () => {
    const base = {
      range: "all",
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-08-23T00:00:00.000Z"),
      bucket: "month",
      summary: { incomeMinor: 0, expenseMinor: 0, netMinor: 0, transactionCount: 0 },
      cashflowSeries: [],
      spendingByCategory: []
    };

    expect(
      AccountInsightsSchema.safeParse({
        ...base,
        balanceSeries: [{ period: "2026-8", balanceMinor: 0 }]
      }).success
    ).toBe(false);
    expect(
      AccountInsightsSchema.safeParse({
        ...base,
        summary: { ...base.summary, incomeMinor: Number.MAX_SAFE_INTEGER + 1 },
        balanceSeries: []
      }).success
    ).toBe(false);
  });
});
