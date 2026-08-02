export const BASIS_POINTS_SCALE = 10_000;

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

export function requireSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }
}

export function safeIntegerFromBigInt(value: bigint, label: string): number {
  if (value < MIN_SAFE_INTEGER_BIGINT || value > MAX_SAFE_INTEGER_BIGINT) {
    throw new RangeError(`${label} exceeds the safe integer range.`);
  }
  return Number(value);
}

/** Returns floor(sqrt(value)) using integer arithmetic only. */
export function integerSquareRoot(value: bigint): bigint {
  if (value < 0n) {
    throw new RangeError("integer square root requires a non-negative value.");
  }
  if (value < 2n) return value;

  let estimate = 1n << ((BigInt(value.toString(2).length) + 1n) / 2n);
  let next = (estimate + value / estimate) / 2n;
  while (next < estimate) {
    estimate = next;
    next = (estimate + value / estimate) / 2n;
  }
  return estimate;
}

/** Divides two integers and rounds an exact half away from zero. */
export function divideRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new RangeError("denominator must not be zero.");
  }

  const negative = numerator < 0n !== denominator < 0n;
  const numeratorMagnitude = numerator < 0n ? -numerator : numerator;
  const denominatorMagnitude = denominator < 0n ? -denominator : denominator;
  const quotient = numeratorMagnitude / denominatorMagnitude;
  const remainder = numeratorMagnitude % denominatorMagnitude;
  const roundedMagnitude = remainder * 2n >= denominatorMagnitude ? quotient + 1n : quotient;

  return negative ? -roundedMagnitude : roundedMagnitude;
}

/** Multiplies through a bigint intermediate, then returns an exact safe integer. */
export function multiplyDivideRound(
  value: number,
  multiplier: number,
  denominator: number
): number {
  requireSafeInteger(value, "value");
  requireSafeInteger(multiplier, "multiplier");
  requireSafeInteger(denominator, "denominator");
  if (denominator === 0) {
    throw new RangeError("denominator must not be zero.");
  }

  const rounded = divideRoundHalfAwayFromZero(
    BigInt(value) * BigInt(multiplier),
    BigInt(denominator)
  );
  return safeIntegerFromBigInt(rounded, "fixed-point result");
}

/** Returns numerator / denominator in basis points with signed, half-away rounding. */
export function ratioBasisPoints(numerator: number, denominator: number): number {
  return multiplyDivideRound(numerator, BASIS_POINTS_SCALE, denominator);
}

/** Returns a similarity-style ratio constrained to the inclusive [0, 10_000] range. */
export function boundedRatioBasisPoints(numerator: number, denominator: number): number {
  requireSafeInteger(numerator, "numerator");
  requireSafeInteger(denominator, "denominator");
  if (denominator <= 0) {
    throw new RangeError("denominator must be positive.");
  }
  if (numerator < 0 || numerator > denominator) {
    throw new RangeError("numerator must be between zero and denominator.");
  }
  return ratioBasisPoints(numerator, denominator);
}
