import { describe, expect, it } from "vitest";

import {
  calibratedRange,
  forecastOne,
  isSparseEligible,
  selectForecastModel
} from "../forecast-models.js";

describe("cash-flow forecast models", () => {
  it("uses only observations before each chronological rolling origin", () => {
    const history = [...Array.from({ length: 60 }, () => 100), 9_000_000];
    expect(forecastOne("trailing_median", history.slice(0, 60))).toBe(100);
    expect(selectForecastModel(history)?.origins).toBeGreaterThanOrEqual(4);
  });

  it("only enables sparse candidates for eligible personal histories", () => {
    const sparse = Array.from({ length: 70 }, (_, index) => (index % 14 === 0 ? 400 : 0));
    expect(isSparseEligible(sparse)).toBe(true);
    expect(isSparseEligible([100, 0, 0, 0])).toBe(false);
    expect(forecastOne("tsb", sparse)).toBeGreaterThanOrEqual(0);
  });

  it("calibrates an empirical range without floats and preserves coverage", () => {
    const range = calibratedRange(1_000, [-100, 0, 100, 200, 300]);
    expect(range.lowerMinor).toBeGreaterThanOrEqual(0);
    expect(range.upperMinor).toBeGreaterThanOrEqual(range.lowerMinor);
    expect(range.coverageBps).toBe(10_000);
  });

  it("handles irregular income, missing recurrence, and insufficient spending with abstention inputs", () => {
    expect(selectForecastModel([0, 10_000, 0, 0, 30_000])).toBeNull();
    expect(forecastOne("trailing_median", [0, 1_000, 0, 5_000])).toBe(0);
  });
});
