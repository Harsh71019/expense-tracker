import { describe, expect, it } from "vitest";

import {
  budgetPaceEvaluationOrigins,
  buildBudgetPace,
  type DailyCategorySpend
} from "../budget-pacing.js";

const categoryId = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const asOf = new Date("2028-02-15T12:00:00.000Z"); // leap-year IST date

function row(month: string, day: number, spentMinor: number): DailyCategorySpend {
  return { categoryId, day: `${month}-${day.toString().padStart(2, "0")}`, spentMinor };
}

function input(
  rows: readonly DailyCategorySpend[],
  overrides: Partial<Parameters<typeof buildBudgetPace>[0]> = {}
) {
  return {
    categoryId,
    month: "2028-02",
    asOf,
    spentMinor: 50_000,
    limitMinor: 100_000,
    effective: true,
    rows,
    resourceLimited: false,
    ...overrides
  };
}

describe("buildBudgetPace", () => {
  it("normalizes historical curves across 28, 30 and 31 day months", () => {
    const result = buildBudgetPace(
      input([
        row("2027-02", 14, 5_000),
        row("2027-02", 28, 5_000),
        row("2027-04", 15, 5_000),
        row("2027-04", 30, 5_000),
        row("2027-05", 16, 5_000),
        row("2027-05", 31, 5_000)
      ])
    );
    expect(result.method).toBe("historical_curve");
    expect(result.historyMonths).toBe(3);
    expect(result.projectedMonthEndMinor).toBe(100_000);
    expect(result.projectedUtilizationBps).toBe(10_000);
  });

  it("uses a clearly labelled linear fallback before three eligible months", () => {
    const result = buildBudgetPace(input([row("2028-01", 31, 10_000)]));
    expect(result).toMatchObject({
      method: "linear_calendar",
      isSufficient: false,
      evidence: ["insufficient_history"]
    });
    expect(result.projectedMonthEndMinor).not.toBeNull();
  });

  it("abstains for ineffective and resource-bound inputs", () => {
    expect(buildBudgetPace(input([], { effective: false }))).toMatchObject({
      method: "abstain",
      evidence: ["ineffective_budget"]
    });
    expect(buildBudgetPace(input([], { resourceLimited: true }))).toMatchObject({
      method: "abstain",
      evidence: ["resource_limit"]
    });
  });

  it("does not leak current or future-month rows into historical training", () => {
    const result = buildBudgetPace(
      input([
        row("2027-11", 30, 10_000),
        row("2027-12", 31, 10_000),
        row("2028-01", 31, 10_000),
        row("2028-02", 1, 9_999_999),
        row("2028-03", 1, 9_999_999)
      ])
    );
    expect(result.historyMonths).toBe(3);
    expect(result.method).toBe("historical_curve");
  });

  it("uses PR-04 expanding origins for chronological evaluation", () => {
    expect(
      budgetPaceEvaluationOrigins(["2027-01", "2027-02", "2027-03", "2027-04", "2027-05"])
    ).toBe(2);
  });
});
