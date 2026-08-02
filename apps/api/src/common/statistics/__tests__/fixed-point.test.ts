import { describe, expect, it } from "vitest";

import {
  boundedRatioBasisPoints,
  divideRoundHalfAwayFromZero,
  integerSquareRoot,
  multiplyDivideRound,
  ratioBasisPoints,
  safeIntegerFromBigInt
} from "../fixed-point.js";

describe("fixed-point arithmetic", () => {
  it.each([
    [5n, 2n, 3n],
    [4n, 2n, 2n],
    [1n, 3n, 0n],
    [-5n, 2n, -3n],
    [5n, -2n, -3n],
    [-5n, -2n, 3n]
  ])("rounds %s / %s half away from zero", (numerator, denominator, expected) => {
    expect(divideRoundHalfAwayFromZero(numerator, denominator)).toBe(expected);
  });

  it("uses bigint multiplication before narrowing", () => {
    expect(
      multiplyDivideRound(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => multiplyDivideRound(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(RangeError);
  });

  it("computes signed and bounded basis-point ratios", () => {
    expect(ratioBasisPoints(1, 3)).toBe(3_333);
    expect(ratioBasisPoints(-1, 8)).toBe(-1_250);
    expect(boundedRatioBasisPoints(1, 8)).toBe(1_250);
    expect(boundedRatioBasisPoints(8, 8)).toBe(10_000);
  });

  it("rejects invalid divisors, ranges, unsafe inputs, and narrowing overflow", () => {
    expect(() => divideRoundHalfAwayFromZero(1n, 0n)).toThrow(RangeError);
    expect(() => ratioBasisPoints(1, 0)).toThrow(RangeError);
    expect(() => ratioBasisPoints(Number.MAX_VALUE, 1)).toThrow(RangeError);
    expect(() => boundedRatioBasisPoints(-1, 2)).toThrow(RangeError);
    expect(() => boundedRatioBasisPoints(3, 2)).toThrow(RangeError);
    expect(() => boundedRatioBasisPoints(0, 0)).toThrow(RangeError);
    expect(() => safeIntegerFromBigInt(BigInt(Number.MAX_SAFE_INTEGER) + 1n, "test")).toThrow(
      RangeError
    );
  });

  it("calculates exact floor square roots at bigint boundaries", () => {
    const maximum = BigInt(Number.MAX_SAFE_INTEGER);
    expect(integerSquareRoot(0n)).toBe(0n);
    expect(integerSquareRoot(1n)).toBe(1n);
    expect(integerSquareRoot(15n)).toBe(3n);
    expect(integerSquareRoot(16n)).toBe(4n);
    expect(integerSquareRoot(maximum * maximum)).toBe(maximum);
    expect(() => integerSquareRoot(-1n)).toThrow(RangeError);
  });

  it("preserves rounding symmetry as a signed arithmetic property", () => {
    for (let numerator = -250; numerator <= 250; numerator += 1) {
      for (let denominator = 1; denominator <= 31; denominator += 1) {
        expect(divideRoundHalfAwayFromZero(BigInt(-numerator), BigInt(denominator))).toBe(
          -divideRoundHalfAwayFromZero(BigInt(numerator), BigInt(denominator))
        );
      }
    }
  });
});
