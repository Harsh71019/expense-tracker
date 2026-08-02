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
