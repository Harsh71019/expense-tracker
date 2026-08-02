import { describe, expect, it } from "vitest";

import { INITIAL_CUSUM_STATE, nextCusumState, tabularCusum } from "../cusum.js";

describe("fixed-point tabular CUSUM", () => {
  const parameters = { referenceAllowanceMinor: 3, decisionThresholdMinor: 10 };

  it("tracks upper and lower cumulative sums and threshold crossings", () => {
    expect(tabularCusum([2, 8, 8, -20, -8], parameters)).toEqual([
      { upperMinor: 0, lowerMinor: 0, upperTriggered: false, lowerTriggered: false },
      { upperMinor: 5, lowerMinor: 0, upperTriggered: false, lowerTriggered: false },
      { upperMinor: 10, lowerMinor: 0, upperTriggered: true, lowerTriggered: false },
      { upperMinor: 0, lowerMinor: -17, upperTriggered: false, lowerTriggered: true },
      { upperMinor: 0, lowerMinor: -22, upperTriggered: false, lowerTriggered: true }
    ]);
  });

  it("does not mutate the prior state and leaves reset or persistence to caller policy", () => {
    const previous = { ...INITIAL_CUSUM_STATE };
    const next = nextCusumState(previous, 15, parameters);
    expect(previous).toEqual(INITIAL_CUSUM_STATE);
    expect(next).toEqual({
      upperMinor: 12,
      lowerMinor: 0,
      upperTriggered: true,
      lowerTriggered: false
    });
  });

  it("returns no states for no observations", () => {
    expect(tabularCusum([], parameters)).toEqual([]);
  });

  it("rejects unsafe arithmetic, invalid parameters, and invalid state signs", () => {
    expect(() => tabularCusum([1], { ...parameters, referenceAllowanceMinor: -1 })).toThrow(
      RangeError
    );
    expect(() => tabularCusum([1], { ...parameters, decisionThresholdMinor: 0 })).toThrow(
      RangeError
    );
    expect(() =>
      nextCusumState(
        { upperMinor: -1, lowerMinor: 0, upperTriggered: false, lowerTriggered: false },
        1,
        parameters
      )
    ).toThrow(RangeError);
    expect(() =>
      nextCusumState(
        {
          upperMinor: Number.MAX_SAFE_INTEGER,
          lowerMinor: 0,
          upperTriggered: true,
          lowerTriggered: false
        },
        1,
        { referenceAllowanceMinor: 0, decisionThresholdMinor: 1 }
      )
    ).toThrow(RangeError);
  });

  it("maintains accumulator sign and bounds properties across deterministic deviations", () => {
    const deviations = Array.from({ length: 500 }, (_, index) => ((index * 7919) % 2_001) - 1_000);
    for (const state of tabularCusum(deviations, {
      referenceAllowanceMinor: 50,
      decisionThresholdMinor: 5_000
    })) {
      expect(state.upperMinor).toBeGreaterThanOrEqual(0);
      expect(state.lowerMinor).toBeLessThanOrEqual(0);
      expect(state.upperTriggered).toBe(state.upperMinor >= 5_000);
      expect(state.lowerTriggered).toBe(state.lowerMinor <= -5_000);
    }
  });
});
