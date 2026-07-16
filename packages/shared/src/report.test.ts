import { describe, expect, it } from "vitest";

import { MonthlyRollupSchema, MonthSchema } from "./report.js";

describe("MonthSchema", () => {
  it("accepts a well-formed YYYY-MM value", () => {
    expect(MonthSchema.parse("2026-07")).toBe("2026-07");
  });

  it("rejects month 00 and month 13", () => {
    expect(() => MonthSchema.parse("2026-00")).toThrow();
    expect(() => MonthSchema.parse("2026-13")).toThrow();
  });

  it("rejects a full date instead of a month", () => {
    expect(() => MonthSchema.parse("2026-07-04")).toThrow();
  });
});

describe("MonthlyRollupSchema", () => {
  it("accepts a rollup with an uncategorized bucket (no categoryId)", () => {
    const parsed = MonthlyRollupSchema.parse({
      userId: "user-a",
      month: "2026-07",
      byCategory: [{ spentMinor: 5_000, incomeMinor: 0, txnCount: 2 }],
      byAccount: [{ accountId: "507f1f77bcf86cd799439011", netMinor: -5_000 }],
      totalExpenseMinor: 5_000,
      totalIncomeMinor: 0,
      computedAt: "2026-08-02T02:00:00.000Z"
    });
    expect(parsed.byCategory[0]?.categoryId).toBeUndefined();
  });
});
