import type { DetectedStreamAmountBehavior } from "@treasury-ops/shared";

import {
  discreteMedian,
  medianAbsoluteDeviation,
  boundedRatioBasisPoints,
  BASIS_POINTS_SCALE
} from "../common/statistics/index.js";

import {
  FIXED_AMOUNT_THRESHOLD_BPS,
  MINIMUM_OBSERVATIONS
} from "./recurring-detection.constants.js";

// ─── Types ────────────────────────────────────────────────────────────

export interface AmountBehaviorResult {
  readonly behavior: DetectedStreamAmountBehavior;
  readonly medianMinor: number;
  readonly madMinor: number;
  readonly stabilityBps: number;
}

// ─── Classification ───────────────────────────────────────────────────

/**
 * Classifies the amount behavior of a stream's transactions and computes
 * an integer stability score in basis points.
 *
 * - **fixed**: MAD is 0 or the MAD/median ratio is below FIXED_AMOUNT_THRESHOLD_BPS
 * - **variable**: amounts vary but the stream has enough observations
 * - **unknown**: insufficient observations
 *
 * All arithmetic uses integer-safe operations from PR 03.
 */
export function classifyAmountBehavior(amounts: readonly number[]): AmountBehaviorResult {
  if (amounts.length < MINIMUM_OBSERVATIONS) {
    return { behavior: "unknown", medianMinor: 0, madMinor: 0, stabilityBps: 0 };
  }

  const medianMinor = discreteMedian(amounts);
  const madMinor = medianAbsoluteDeviation(amounts);

  if (medianMinor === 0) {
    return { behavior: "unknown", medianMinor, madMinor, stabilityBps: 0 };
  }

  // Stability is 10,000 − (MAD/median ratio in bps), clamped to [0, 10,000]
  const variabilityBps = boundedRatioBasisPoints(madMinor, medianMinor);
  const stabilityBps = Math.max(0, BASIS_POINTS_SCALE - variabilityBps);

  if (madMinor === 0 || variabilityBps <= FIXED_AMOUNT_THRESHOLD_BPS) {
    return { behavior: "fixed", medianMinor, madMinor, stabilityBps };
  }

  return { behavior: "variable", medianMinor, madMinor, stabilityBps };
}

/**
 * Convenience: scores amount stability as a single bps value for the
 * composite scoring function, without full classification.
 */
export function scoreAmountStability(amounts: readonly number[]): number {
  return classifyAmountBehavior(amounts).stabilityBps;
}
