import { describe, expect, it } from "vitest";

import { sparklineAreaPath, sparklineLinePath, sparklinePoints } from "./sparkline-path";

describe("sparklinePoints", () => {
  it("returns no points for an empty series", () => {
    expect(sparklinePoints([], 100, 40)).toEqual([]);
  });

  it("places a single value's point on the vertical mid-line for a flat range", () => {
    const [point] = sparklinePoints([100], 100, 40);
    expect(point).toBeDefined();
    expect(point?.[0]).toBeCloseTo(3);
  });

  it("spans the padded width across the series and orders points left to right", () => {
    const points = sparklinePoints([0, 50, 100], 100, 40);
    expect(points).toHaveLength(3);
    expect(points[0]?.[0]).toBeCloseTo(3);
    expect(points.at(-1)?.[0]).toBeCloseTo(97);
    const xs = points.map(([x]) => x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("maps the highest value to the smallest y (nearer the top)", () => {
    const points = sparklinePoints([0, 100], 100, 40);
    const [low, high] = points;
    expect(low).toBeDefined();
    expect(high).toBeDefined();
    if (low === undefined || high === undefined) throw new Error("expected two points");
    expect(high[1]).toBeLessThan(low[1]);
  });
});

describe("sparklineLinePath", () => {
  it("starts with M and continues with L commands", () => {
    const path = sparklineLinePath([
      [0, 10],
      [5, 20]
    ]);
    expect(path).toBe("M0.0 10.0 L5.0 20.0");
  });
});

describe("sparklineAreaPath", () => {
  it("returns an empty string when there are no points", () => {
    expect(sparklineAreaPath([], 40)).toBe("");
  });

  it("closes the line path down to the floor and back to the start", () => {
    const path = sparklineAreaPath(
      [
        [3, 10],
        [97, 20]
      ],
      40
    );
    expect(path).toBe("M3.0 10.0 L97.0 20.0 L97.0 37.0 L3.0 37.0 Z");
  });
});
