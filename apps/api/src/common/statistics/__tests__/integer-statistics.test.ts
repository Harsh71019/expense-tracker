import { describe, expect, it } from "vitest";

import {
  discreteMedian,
  discreteQuantile,
  medianAbsoluteDeviation
} from "../integer-statistics.js";

function deterministicShuffle(values: readonly number[], seed: number): number[] {
  const shuffled = [...values];
  let state = seed;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    const current = shuffled[index];
    const other = shuffled[swapIndex];
    if (current === undefined || other === undefined) continue;
    shuffled[index] = other;
    shuffled[swapIndex] = current;
  }
  return shuffled;
}

describe("discrete integer statistics", () => {
  it("matches percentile_disc ranks without interpolating paise", () => {
    const even = [40, 10, 30, 20];
    expect(discreteQuantile(even, 0)).toBe(10);
    expect(discreteQuantile(even, 2_500)).toBe(10);
    expect(discreteQuantile(even, 5_000)).toBe(20);
    expect(discreteQuantile(even, 7_500)).toBe(30);
    expect(discreteQuantile(even, 10_000)).toBe(40);
    expect(even).toEqual([40, 10, 30, 20]);
  });

  it("returns the discrete lower median for even samples", () => {
    expect(discreteMedian([10, 20, 30, 40])).toBe(20);
    expect(discreteMedian([10, 20, 30, 40, 50])).toBe(30);
    expect(discreteMedian([42])).toBe(42);
  });

  it("calculates median absolute deviation as an observed integer", () => {
    expect(medianAbsoluteDeviation([1, 1, 2, 2, 4, 6, 9])).toBe(1);
    expect(medianAbsoluteDeviation([100, 100, 100])).toBe(0);
    expect(medianAbsoluteDeviation([-5, -1, 2, 8, 20])).toBe(6);
  });

  it("rejects empty, invalid-quantile, unsafe, and deviation-overflow inputs", () => {
    expect(() => discreteMedian([])).toThrow(RangeError);
    expect(() => discreteQuantile([1], -1)).toThrow(RangeError);
    expect(() => discreteQuantile([1], 10_001)).toThrow(RangeError);
    expect(() => discreteQuantile([1.5], 5_000)).toThrow(RangeError);
    expect(() =>
      medianAbsoluteDeviation([Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])
    ).toThrow(RangeError);
  });

  it("is permutation invariant, monotone by quantile, and always returns a member", () => {
    const samples = [
      [7],
      [9, -4, 12, 12, 0],
      [Number.MIN_SAFE_INTEGER, -1, 0, 1, Number.MAX_SAFE_INTEGER]
    ];
    for (const sample of samples) {
      let previous = Number.MIN_SAFE_INTEGER;
      for (let quantileBps = 0; quantileBps <= 10_000; quantileBps += 137) {
        const result = discreteQuantile(sample, quantileBps);
        expect(sample).toContain(result);
        expect(result).toBeGreaterThanOrEqual(previous);
        expect(discreteQuantile(deterministicShuffle(sample, quantileBps + 1), quantileBps)).toBe(
          result
        );
        previous = result;
      }
    }
  });

  it("preserves median and MAD under safe translation", () => {
    const sample = [-100, -10, 0, 40, 200, 300];
    for (let translation = -1_000; translation <= 1_000; translation += 137) {
      const translated = sample.map((value) => value + translation);
      expect(discreteMedian(translated)).toBe(discreteMedian(sample) + translation);
      expect(medianAbsoluteDeviation(translated)).toBe(medianAbsoluteDeviation(sample));
    }
  });
});
