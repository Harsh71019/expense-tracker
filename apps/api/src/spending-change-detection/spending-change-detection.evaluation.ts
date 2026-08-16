import type {
  SpendingChangeDecisionMetrics,
  SpendingChangePromotionDecision
} from "@treasury-ops/shared";

import {
  buildRollingOriginPlan,
  calculateSpendingChangeDecisionMetrics,
  type SpendingChangeDecisionObservation
} from "../common/algorithm-evaluation/index.js";
import {
  detectSpendingChanges,
  type MatureStreamInput,
  type TransactionInput
} from "./detect-spending-changes.js";
import { DETECTOR_VERSION } from "./spending-change-detection.constants.js";

export interface LabeledSpendingChangePoint {
  readonly transaction: TransactionInput;
  readonly isTrueChangePoint: boolean;
  readonly trueNewMedianMinor: number | null;
}

export interface SpendingChangeEvaluationResult {
  readonly evaluatedOriginCount: number;
  readonly skippedOriginCount: number;
  readonly candidateMetrics: SpendingChangeDecisionMetrics;
  readonly baselineMetrics: SpendingChangeDecisionMetrics;
  readonly promotion: SpendingChangePromotionDecision;
}

export const MINIMUM_PROMOTION_WINDOWS = 12;
export const PROMOTION_PRECISION_FLOOR_BPS = 8_000;
export const PROMOTION_RECALL_FLOOR_BPS = 7_000;
export const MAX_FALSE_CHANGE_RATE_BPS = 1_000;

/**
 * Expanding rolling-origin evaluation preventing future-data leakage.
 * Every detector step receives only the historical prefix up to the split origin.
 */
export function evaluateSpendingChangeDetectionChronologically(
  points: readonly LabeledSpendingChangePoint[],
  matureStreams: readonly MatureStreamInput[],
  userId: string,
  maxOrigins = 24
): SpendingChangeEvaluationResult {
  const sorted = [...points].sort(
    (left, right) =>
      left.transaction.occurredAt.getTime() - right.transaction.occurredAt.getTime() ||
      left.transaction.id.localeCompare(right.transaction.id)
  );

  const chronological = sorted.map((point, index) => ({ time: index + 1, value: point }));
  const plan = buildRollingOriginPlan(chronological, {
    minimumTrainingSize: 10,
    horizonSize: 1,
    stepSize: 1,
    maxOrigins
  });

  const candidateObservations: SpendingChangeDecisionObservation[] = [];
  const baselineObservations: SpendingChangeDecisionObservation[] = [];

  for (const split of plan.splits) {
    const target = split.test[0]?.value;
    const lastTraining = split.training.at(-1)?.value;
    if (target === undefined || lastTraining === undefined) continue;

    const trainingTransactions = split.training.map((p) => p.value.transaction);
    const asOf = lastTraining.transaction.occurredAt;

    // Filter mature stream members to only those in the training set
    const boundedStreams: MatureStreamInput[] = matureStreams.map((s) => ({
      ...s,
      members: s.members.filter((m) => m.occurredAt <= asOf)
    }));

    const detected = detectSpendingChanges(trainingTransactions, boundedStreams, userId, asOf);
    const hasDetectedChange =
      detected.recurringChanges.length > 0 || detected.spendingRegimes.length > 0;

    const predictedNewMedian =
      detected.recurringChanges[0]?.newMedianMinor ??
      detected.spendingRegimes[0]?.newMedianMinor ??
      null;

    const actualChange = target.isTrueChangePoint;
    const actualNewMedian = target.trueNewMedianMinor;

    candidateObservations.push({
      actualChange,
      predictedChange: hasDetectedChange,
      lagDays: hasDetectedChange ? 0 : null,
      actualNewMedianMinor: actualNewMedian,
      predictedNewMedianMinor: predictedNewMedian
    });

    baselineObservations.push({
      actualChange,
      predictedChange: false,
      lagDays: null,
      actualNewMedianMinor: actualNewMedian,
      predictedNewMedianMinor: null
    });
  }

  const candidateMetrics = calculateSpendingChangeDecisionMetrics(candidateObservations);
  const baselineMetrics = calculateSpendingChangeDecisionMetrics(baselineObservations);

  const reasons: string[] = [];
  let eligible = true;

  if (plan.evaluatedOriginCount < MINIMUM_PROMOTION_WINDOWS) {
    eligible = false;
    reasons.push(
      `Insufficient evaluated decision windows (${plan.evaluatedOriginCount} < ${MINIMUM_PROMOTION_WINDOWS}).`
    );
  }

  const precisionBps = candidateMetrics.changeDecision.precisionBps ?? 0;
  if (precisionBps < PROMOTION_PRECISION_FLOOR_BPS) {
    eligible = false;
    reasons.push(
      `Candidate precision (${precisionBps} bps) is below floor (${PROMOTION_PRECISION_FLOOR_BPS} bps).`
    );
  }

  const recallBps = candidateMetrics.changeDecision.recallBps ?? 0;
  if (recallBps < PROMOTION_RECALL_FLOOR_BPS) {
    eligible = false;
    reasons.push(
      `Candidate recall (${recallBps} bps) is below floor (${PROMOTION_RECALL_FLOOR_BPS} bps).`
    );
  }

  const falseRateBps = candidateMetrics.falseChangePointRateBps ?? 0;
  if (falseRateBps > MAX_FALSE_CHANGE_RATE_BPS) {
    eligible = false;
    reasons.push(
      `Candidate false change point rate (${falseRateBps} bps) exceeds ceiling (${MAX_FALSE_CHANGE_RATE_BPS} bps).`
    );
  }

  const promotion: SpendingChangePromotionDecision = {
    activeVersion: DETECTOR_VERSION,
    candidateVersion: DETECTOR_VERSION,
    eligible,
    reasons,
    metrics: candidateMetrics
  };

  return {
    evaluatedOriginCount: plan.evaluatedOriginCount,
    skippedOriginCount: plan.skippedOriginCount,
    candidateMetrics,
    baselineMetrics,
    promotion
  };
}
