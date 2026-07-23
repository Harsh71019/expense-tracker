import { describe, expect, it } from "vitest";

import { pieWedges } from "./pie-path";

describe("pieWedges", () => {
  it("returns no wedges for an empty series", () => {
    expect(pieWedges([], 190)).toEqual([]);
  });

  it("returns one filled wedge per slice, each carrying its colour", () => {
    const wedges = pieWedges(
      [
        { value: 30, color: "#f97316" },
        { value: 70, color: "#3b82f6" }
      ],
      190
    );
    expect(wedges).toHaveLength(2);
    expect(wedges[0]?.color).toBe("#f97316");
    expect(wedges[1]?.color).toBe("#3b82f6");
    // Wedge is a closed shape from the centre, not a bare stroke arc.
    expect(wedges[0]?.path).toMatch(/^M 95(\.00)? 95(\.00)? L .* A .* 0 0 1 .* Z$/);
  });

  it("marks a slice spanning more than half the circle with the large-arc flag", () => {
    const wedges = pieWedges(
      [
        { value: 80, color: "#f97316" },
        { value: 20, color: "#3b82f6" }
      ],
      190
    );
    expect(wedges[0]?.path).toContain(" 1 1 ");
  });

  it("treats an all-zero series as an empty total rather than dividing by zero", () => {
    const wedges = pieWedges(
      [
        { value: 0, color: "#f97316" },
        { value: 0, color: "#3b82f6" }
      ],
      190
    );
    expect(wedges).toHaveLength(2);
    expect(wedges[0]?.path).not.toContain("NaN");
  });

  it("renders a single 100% slice as a full circle instead of a degenerate zero-length arc", () => {
    const wedges = pieWedges([{ value: 100, color: "#f97316" }], 190);
    expect(wedges).toHaveLength(1);
    // A single arc command whose start and end coincide is invisible in SVG;
    // a full circle must be split into two half-circle arcs to render.
    const arcCommandCount = wedges[0]?.path.match(/A /g)?.length ?? 0;
    expect(arcCommandCount).toBe(2);
  });

  it("reaches all the way to the edge of the given size, with no inset", () => {
    const wedges = pieWedges([{ value: 100, color: "#f97316" }], 190);
    expect(wedges[0]?.path).toContain("95.00 0.00");
  });
});
