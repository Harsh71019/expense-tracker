import { describe, expect, it } from "vitest";

import { donutArcs } from "./donut-path";

describe("donutArcs", () => {
  it("returns no arcs for an empty series", () => {
    expect(donutArcs([], 190)).toEqual([]);
  });

  it("returns one arc per slice, each carrying its colour", () => {
    const arcs = donutArcs(
      [
        { value: 30, color: "#f97316" },
        { value: 70, color: "#3b82f6" }
      ],
      190
    );
    expect(arcs).toHaveLength(2);
    expect(arcs[0]?.color).toBe("#f97316");
    expect(arcs[1]?.color).toBe("#3b82f6");
    expect(arcs[0]?.path).toMatch(/^M .* A .* 0 0 1 /);
  });

  it("marks a slice spanning more than half the circle with the large-arc flag", () => {
    const arcs = donutArcs(
      [
        { value: 80, color: "#f97316" },
        { value: 20, color: "#3b82f6" }
      ],
      190
    );
    expect(arcs[0]?.path).toContain(" 1 1 ");
  });

  it("treats an all-zero series as an empty total rather than dividing by zero", () => {
    const arcs = donutArcs(
      [
        { value: 0, color: "#f97316" },
        { value: 0, color: "#3b82f6" }
      ],
      190
    );
    expect(arcs).toHaveLength(2);
    expect(arcs[0]?.path).not.toContain("NaN");
  });
});
