import { describe, expect, it } from "vitest";

import { MonthlySpendingSchema } from "./dashboard.js";

describe("MonthlySpendingSchema", () => {
  it("parses month-to-date spending and coerces bucket timestamps", () => {
    const parsed = MonthlySpendingSchema.parse({
      period: "2026-08",
      asOf: "2026-08-03T06:00:00.000Z",
      totalMinor: 12_500,
      daily: [{ date: "2026-07-31T18:30:00.000Z", amountMinor: 12_500 }],
      weekly: [
        {
          startAt: "2026-07-31T18:30:00.000Z",
          endAt: "2026-08-02T18:30:00.000Z",
          amountMinor: 12_500
        }
      ]
    });

    expect(parsed.asOf).toBeInstanceOf(Date);
    expect(parsed.daily[0]?.date).toBeInstanceOf(Date);
    expect(parsed.weekly[0]?.amountMinor).toBe(12_500);
  });

  it("rejects fractional paise values", () => {
    expect(() =>
      MonthlySpendingSchema.parse({
        period: "2026-08",
        asOf: new Date(),
        totalMinor: 10.5,
        daily: [],
        weekly: []
      })
    ).toThrow();
  });
});
