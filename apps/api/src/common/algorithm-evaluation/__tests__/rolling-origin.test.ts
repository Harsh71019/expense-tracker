import { describe, expect, it } from "vitest";

import {
  buildChronologicalHoldout,
  buildRollingOriginPlan,
  type ChronologicalPoint
} from "../rolling-origin.js";

function points(count: number): readonly ChronologicalPoint<string>[] {
  return Array.from({ length: count }, (_, index) => ({
    time: 20_000 + index,
    value: `period-${index}`
  }));
}

describe("chronological evaluation splits", () => {
  it("holds out only the newest targets and never leaks target data into training", () => {
    const split = buildChronologicalHoldout(points(8), 2);
    expect(split).not.toBeNull();
    expect(split?.training.map((point) => point.value)).toEqual([
      "period-0",
      "period-1",
      "period-2",
      "period-3",
      "period-4",
      "period-5"
    ]);
    expect(split?.test.map((point) => point.value)).toEqual(["period-6", "period-7"]);
    expect(split?.originTime).toBeLessThan(split?.targetStartTime ?? 0);
  });

  it("returns null when a holdout would leave no training history", () => {
    expect(buildChronologicalHoldout(points(2), 2)).toBeNull();
  });

  it("builds expanding origins at the actual requested horizon", () => {
    const plan = buildRollingOriginPlan(points(12), {
      minimumTrainingSize: 4,
      horizonSize: 3,
      stepSize: 2,
      maxOrigins: 10
    });

    expect(plan.eligibleOriginCount).toBe(3);
    expect(plan.evaluatedOriginCount).toBe(3);
    expect(plan.skippedOriginCount).toBe(0);
    expect(plan.splits.map((split) => split.training.length)).toEqual([4, 6, 8]);
    expect(plan.splits.map((split) => split.test.length)).toEqual([3, 3, 3]);
    for (const split of plan.splits) {
      expect(split.originTime).toBeLessThan(split.targetStartTime);
      expect(split.training.at(-1)?.time).toBe(split.originTime);
      expect(split.test[0]?.time).toBe(split.targetStartTime);
    }
  });

  it("keeps the newest bounded origins and discloses every skipped origin", () => {
    const plan = buildRollingOriginPlan(points(20), {
      minimumTrainingSize: 5,
      horizonSize: 2,
      stepSize: 1,
      maxOrigins: 3
    });

    expect(plan.eligibleOriginCount).toBe(14);
    expect(plan.evaluatedOriginCount).toBe(3);
    expect(plan.skippedOriginCount).toBe(11);
    expect(plan.splits.map((split) => split.training.length)).toEqual([16, 17, 18]);
  });

  it("rejects unsorted, duplicate, unsafe, and invalid-budget inputs", () => {
    expect(() =>
      buildRollingOriginPlan(
        [
          { time: 2, value: "later" },
          { time: 1, value: "earlier" }
        ],
        { minimumTrainingSize: 1, horizonSize: 1, stepSize: 1, maxOrigins: 1 }
      )
    ).toThrow("strictly increasing");
    expect(() =>
      buildRollingOriginPlan(
        [
          { time: 1, value: "first" },
          { time: 1, value: "same-period" }
        ],
        { minimumTrainingSize: 1, horizonSize: 1, stepSize: 1, maxOrigins: 1 }
      )
    ).toThrow("strictly increasing");
    expect(() =>
      buildRollingOriginPlan([{ time: Number.MAX_VALUE, value: "unsafe" }], {
        minimumTrainingSize: 1,
        horizonSize: 1,
        stepSize: 1,
        maxOrigins: 1
      })
    ).toThrow("safe integer");
    expect(() =>
      buildRollingOriginPlan(points(3), {
        minimumTrainingSize: 0,
        horizonSize: 1,
        stepSize: 1,
        maxOrigins: 1
      })
    ).toThrow("positive");
  });
});
