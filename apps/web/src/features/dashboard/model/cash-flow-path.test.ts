import { describe, expect, it } from "vitest";

import {
  CASH_FLOW_DIMENSIONS,
  cashFlowMax,
  cashFlowPoints,
  cashFlowSeriesPaths
} from "./cash-flow-path";

describe("cashFlowMax", () => {
  it("pads the maximum value by 10%", () => {
    expect(cashFlowMax([100, 200, 50])).toBeCloseTo(220);
  });

  it("falls back to 1 when every value is zero", () => {
    expect(cashFlowMax([0, 0])).toBe(1);
  });
});

describe("cashFlowPoints", () => {
  it("maps values into the chart's coordinate space", () => {
    const points = cashFlowPoints([0, 100], 100);
    expect(points).toHaveLength(2);
    const [first, second] = points;
    expect(first?.[0]).toBe(CASH_FLOW_DIMENSIONS.padL);
    expect(second?.[0]).toBeCloseTo(CASH_FLOW_DIMENSIONS.width - CASH_FLOW_DIMENSIONS.padR);
    expect(first?.[1]).toBeGreaterThan(second?.[1] ?? 0);
  });

  it("centers a single point without dividing by zero", () => {
    const points = cashFlowPoints([50], 100);
    expect(points).toHaveLength(1);
    expect(points[0]?.[0]).toBe(CASH_FLOW_DIMENSIONS.padL);
  });
});

describe("cashFlowSeriesPaths", () => {
  it("builds a line path and a closed area path", () => {
    const points = cashFlowPoints([0, 100], 100);
    const { line, area } = cashFlowSeriesPaths(points);
    expect(line.startsWith("M")).toBe(true);
    expect(area.endsWith("Z")).toBe(true);
    expect(area.startsWith(line)).toBe(true);
  });

  it("returns an empty area for no points", () => {
    expect(cashFlowSeriesPaths([])).toEqual({ line: "", area: "" });
  });
});
