import { describe, expect, it } from "vitest";

import { goalProgressRingGeometry } from "./goal-progress-ring-path";

describe("goalProgressRingGeometry", () => {
  it("maps partial progress onto the ring", () => {
    const geometry = goalProgressRingGeometry(25_000, 100_000, 40);

    expect(geometry.ratio).toBe(0.25);
    expect(geometry.percentage).toBe(25);
    expect(geometry.dashOffset).toBeCloseTo(geometry.circumference * 0.75);
  });

  it("clamps negative and overfunded progress", () => {
    expect(goalProgressRingGeometry(-100, 10_000, 40).percentage).toBe(0);
    expect(goalProgressRingGeometry(20_000, 10_000, 40).percentage).toBe(100);
  });
});
