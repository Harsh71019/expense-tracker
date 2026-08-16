import { requireSafeInteger, safeIntegerFromBigInt } from "./fixed-point.js";

export type CusumState = Readonly<{
  upperMinor: number;
  lowerMinor: number;
  upperTriggered: boolean;
  lowerTriggered: boolean;
}>;

export type CusumParameters = Readonly<{
  referenceAllowanceMinor: number;
  decisionThresholdMinor: number;
}>;

export const INITIAL_CUSUM_STATE: CusumState = {
  upperMinor: 0,
  lowerMinor: 0,
  upperTriggered: false,
  lowerTriggered: false
};

function validateParameters(parameters: CusumParameters): void {
  requireSafeInteger(parameters.referenceAllowanceMinor, "referenceAllowanceMinor");
  requireSafeInteger(parameters.decisionThresholdMinor, "decisionThresholdMinor");
  if (parameters.referenceAllowanceMinor < 0) {
    throw new RangeError("referenceAllowanceMinor must be non-negative.");
  }
  if (parameters.decisionThresholdMinor <= 0) {
    throw new RangeError("decisionThresholdMinor must be positive.");
  }
}

/** Applies one fixed-point tabular CUSUM observation in integer paise. */
export function nextCusumState(
  previous: CusumState,
  deviationMinor: number,
  parameters: CusumParameters
): CusumState {
  requireSafeInteger(previous.upperMinor, "upperMinor");
  requireSafeInteger(previous.lowerMinor, "lowerMinor");
  requireSafeInteger(deviationMinor, "deviationMinor");
  validateParameters(parameters);
  if (previous.upperMinor < 0 || previous.lowerMinor > 0) {
    throw new RangeError("CUSUM state signs are invalid.");
  }

  const deviation = BigInt(deviationMinor);
  const allowance = BigInt(parameters.referenceAllowanceMinor);
  const rawUpper = BigInt(previous.upperMinor) + deviation - allowance;
  const rawLower = BigInt(previous.lowerMinor) + deviation + allowance;
  const upperMinor = safeIntegerFromBigInt(rawUpper > 0n ? rawUpper : 0n, "upper CUSUM");
  const lowerMinor = safeIntegerFromBigInt(rawLower < 0n ? rawLower : 0n, "lower CUSUM");

  return {
    upperMinor,
    lowerMinor,
    upperTriggered: upperMinor >= parameters.decisionThresholdMinor,
    lowerTriggered: lowerMinor <= -parameters.decisionThresholdMinor
  };
}

/** Returns each successive CUSUM state; warm-up, persistence, and reset remain caller policy. */
export function tabularCusum(
  deviationsMinor: readonly number[],
  parameters: CusumParameters,
  initial: CusumState = INITIAL_CUSUM_STATE
): CusumState[] {
  validateParameters(parameters);
  const states: CusumState[] = [];
  let state = initial;
  for (const deviationMinor of deviationsMinor) {
    state = nextCusumState(state, deviationMinor, parameters);
    states.push(state);
  }
  return states;
}

export interface CalibrateCusumOptions {
  readonly allowanceRatioBps?: number;
  readonly thresholdRatioBps?: number;
  readonly floorAllowanceMinor?: number;
  readonly floorThresholdMinor?: number;
  readonly zeroMadRatioBps?: number;
  readonly zeroMadFloorMinor?: number;
}

/**
 * Calibrates CUSUM reference allowance (kMinor) and decision threshold (hMinor)
 * from stream/series MAD and baseline median in integer paise, with explicit
 * zero-MAD fallback to prevent zero division and zero tolerance.
 */
export function calibrateCusumParameters(
  madMinor: number,
  baselineMedianMinor: number,
  options: CalibrateCusumOptions = {}
): CusumParameters {
  requireSafeInteger(madMinor, "madMinor");
  requireSafeInteger(baselineMedianMinor, "baselineMedianMinor");
  if (madMinor < 0) {
    throw new RangeError("madMinor must be non-negative.");
  }
  if (baselineMedianMinor < 0) {
    throw new RangeError("baselineMedianMinor must be non-negative.");
  }

  const allowanceRatioBps = options.allowanceRatioBps ?? 5_000;
  const thresholdRatioBps = options.thresholdRatioBps ?? 40_000;
  const floorAllowanceMinor = options.floorAllowanceMinor ?? 100;
  const floorThresholdMinor = options.floorThresholdMinor ?? 1_000;
  const zeroMadRatioBps = options.zeroMadRatioBps ?? 100;
  const zeroMadFloorMinor = options.zeroMadFloorMinor ?? 1_000;

  let scaleMinor = madMinor;
  if (scaleMinor === 0) {
    const relativeScale =
      baselineMedianMinor > 0
        ? safeIntegerFromBigInt(
            (BigInt(baselineMedianMinor) * BigInt(zeroMadRatioBps) + 5_000n) / 10_000n,
            "zero-MAD relative scale"
          )
        : 0;
    scaleMinor = Math.max(zeroMadFloorMinor, relativeScale);
  }

  const rawAllowance = safeIntegerFromBigInt(
    (BigInt(scaleMinor) * BigInt(allowanceRatioBps) + 5_000n) / 10_000n,
    "CUSUM allowance"
  );
  const referenceAllowanceMinor = Math.max(floorAllowanceMinor, rawAllowance);

  const rawThreshold = safeIntegerFromBigInt(
    (BigInt(scaleMinor) * BigInt(thresholdRatioBps) + 5_000n) / 10_000n,
    "CUSUM threshold"
  );
  const decisionThresholdMinor = Math.max(floorThresholdMinor, rawThreshold);

  return {
    referenceAllowanceMinor,
    decisionThresholdMinor
  };
}
