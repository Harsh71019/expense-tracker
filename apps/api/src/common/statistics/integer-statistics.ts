import { BASIS_POINTS_SCALE, requireSafeInteger, safeIntegerFromBigInt } from "./fixed-point.js";

function sortedSafeIntegers(values: readonly number[]): number[] {
  if (values.length === 0) {
    throw new RangeError("integer statistics require at least one observation.");
  }
  for (const value of values) {
    requireSafeInteger(value, "observation");
  }
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * PostgreSQL percentile_disc semantics using a basis-point quantile.
 * The result is always an observed integer and input order is not mutated.
 */
export function discreteQuantile(values: readonly number[], quantileBps: number): number {
  requireSafeInteger(quantileBps, "quantileBps");
  if (quantileBps < 0 || quantileBps > BASIS_POINTS_SCALE) {
    throw new RangeError("quantileBps must be between 0 and 10,000.");
  }

  const sorted = sortedSafeIntegers(values);
  const rankNumerator = BigInt(quantileBps) * BigInt(sorted.length);
  const rank =
    quantileBps === 0
      ? 1n
      : (rankNumerator + BigInt(BASIS_POINTS_SCALE) - 1n) / BigInt(BASIS_POINTS_SCALE);
  const index = Number(rank - 1n);
  const result = sorted[index];
  if (result === undefined) {
    throw new RangeError("discrete quantile computed an out-of-range rank.");
  }
  return result;
}

/** Returns the discrete lower median, matching percentile_disc(0.5). */
export function discreteMedian(values: readonly number[]): number {
  return discreteQuantile(values, BASIS_POINTS_SCALE / 2);
}

/** Returns median(|x - median(x)|) without interpolating paise values. */
export function medianAbsoluteDeviation(values: readonly number[]): number {
  const median = discreteMedian(values);
  const deviations = values.map((value) => {
    requireSafeInteger(value, "observation");
    const difference = BigInt(value) - BigInt(median);
    const magnitude = difference < 0n ? -difference : difference;
    return safeIntegerFromBigInt(magnitude, "absolute deviation");
  });
  return discreteMedian(deviations);
}
