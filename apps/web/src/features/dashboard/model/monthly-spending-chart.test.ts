import { describe, expect, it } from "vitest";

import { chartMaximum, lineChartPoints, linePath } from "./monthly-spending-chart";

describe("monthly spending chart model", () => {
  it("keeps an all-zero series on a finite baseline", () => {
    expect(chartMaximum([0, 0])).toBe(1);
    expect(lineChartPoints([0, 0], 100, 50, 10, 5, 10)).toEqual([
      [10, 40],
      [90, 40]
    ]);
  });

  it("centers a single weekly point and produces a valid path", () => {
    const points = lineChartPoints([500], 100, 50, 10, 5, 10);
    expect(points).toEqual([[50, 5]]);
    expect(linePath(points)).toBe("M 50.00 5.00");
  });
});
