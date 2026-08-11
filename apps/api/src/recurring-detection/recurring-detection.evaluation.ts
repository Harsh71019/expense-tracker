import type {
  RecurrenceDecisionMetrics,
  RecurringDetectionPromotionDecision
} from "@treasury-ops/shared";

import {
  buildRollingOriginPlan,
  calculateRecurrenceDecisionMetrics
} from "../common/algorithm-evaluation/index.js";
import type { RecurrenceDecisionObservation } from "../common/algorithm-evaluation/decision-metrics.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import { normalizeTransactionText } from "../common/transaction-text/normalize-transaction-text.js";
import { detectRecurringStreams } from "./detect-recurring-streams.js";
import type { TransactionInput } from "./detect-recurring-streams.js";
import {
  MINIMUM_PROMOTION_WINDOWS,
  PROMOTION_PRECISION_FLOOR_BPS,
  RECURRING_DETECTOR_VERSION
} from "./recurring-detection.constants.js";

export interface LabeledRecurrencePoint {
  readonly transaction: TransactionInput;
  readonly truthStreamKey: string | null;
}

export interface RecurringDetectionEvaluationResult {
  readonly evaluatedOriginCount: number;
  readonly skippedOriginCount: number;
  readonly promotion: RecurringDetectionPromotionDecision;
}

/**
 * Expanding rolling-origin evaluation. Every detector call receives only the
 * split's training prefix; the target observation is never available as input.
 */
export function evaluateRecurringDetectionChronologically(
  points: readonly LabeledRecurrencePoint[],
  userId: string,
  maxOrigins = 24
): RecurringDetectionEvaluationResult {
  const sorted = [...points].sort(
    (left, right) =>
      left.transaction.occurredAt.getTime() - right.transaction.occurredAt.getTime() ||
      left.transaction.id.localeCompare(right.transaction.id)
  );
  const chronological = sorted.map((point, index) => ({ time: index + 1, value: point }));
  const plan = buildRollingOriginPlan(chronological, {
    minimumTrainingSize: 2,
    horizonSize: 1,
    stepSize: 1,
    maxOrigins
  });
  const candidateObservations: RecurrenceDecisionObservation[] = [];
  const baselineObservations: RecurrenceDecisionObservation[] = [];

  for (const split of plan.splits) {
    const target = split.test[0]?.value;
    const lastTraining = split.training.at(-1)?.value;
    if (target === undefined || lastTraining === undefined) continue;
    const training = split.training.map((point) => point.value);
    const trainingTransactions = training.map((point) => point.transaction);
    const asOf = lastTraining.transaction.occurredAt;
    const detected = detectRecurringStreams(trainingTransactions, userId, asOf);
    const targetNormalized = normalizeTransactionText(target.transaction.description);
    const predicted = detected.streams.find(
      (stream) =>
        stream.transactionType === target.transaction.type &&
        stream.counterpartyKey === targetNormalized.counterpartyKey
    );
    const actualMature =
      target.truthStreamKey !== null &&
      training.filter((point) => point.truthStreamKey === target.truthStreamKey).length >= 2;
    const predictedMature = predicted?.state === "mature" || predicted?.state === "stale";
    candidateObservations.push({
      actualMature,
      predictedMature,
      actualNextDate: actualMature ? toISTCalendarDate(target.transaction.occurredAt) : null,
      predictedNextDate: predictedMature ? (predicted?.nextExpectedDate ?? null) : null,
      actualNextAmountMinor: actualMature ? target.transaction.amountMinor : null,
      predictedNextAmountMinor: predictedMature ? (predicted?.medianAmountMinor ?? null) : null,
      missedPaymentLeadDays: null,
      reviewOutcome: "unreviewed"
    });
    baselineObservations.push({
      actualMature,
      predictedMature: false,
      actualNextDate: actualMature ? toISTCalendarDate(target.transaction.occurredAt) : null,
      predictedNextDate: null,
      actualNextAmountMinor: actualMature ? target.transaction.amountMinor : null,
      predictedNextAmountMinor: null,
      missedPaymentLeadDays: null,
      reviewOutcome: "unreviewed"
    });
  }

  const candidateMetrics = calculateRecurrenceDecisionMetrics(candidateObservations);
  const baselineMetrics = calculateRecurrenceDecisionMetrics(baselineObservations);
  return {
    evaluatedOriginCount: plan.evaluatedOriginCount,
    skippedOriginCount: plan.skippedOriginCount,
    promotion: assessRecurringDetectionPromotion(
      candidateMetrics,
      baselineMetrics,
      plan.evaluatedOriginCount
    )
  };
}

export function assessRecurringDetectionPromotion(
  candidateMetrics: RecurrenceDecisionMetrics,
  baselineMetrics: RecurrenceDecisionMetrics,
  completeDecisionWindows: number
): RecurringDetectionPromotionDecision {
  if (completeDecisionWindows < MINIMUM_PROMOTION_WINDOWS) {
    return decision(
      false,
      "insufficient_windows",
      completeDecisionWindows,
      candidateMetrics,
      baselineMetrics
    );
  }
  const precision = candidateMetrics.matureStreamDecision.precisionBps;
  if (precision === null || precision < PROMOTION_PRECISION_FLOOR_BPS) {
    return decision(
      false,
      "precision_below_floor",
      completeDecisionWindows,
      candidateMetrics,
      baselineMetrics
    );
  }
  const candidateDecision = candidateMetrics.matureStreamDecision;
  const baselineDecision = baselineMetrics.matureStreamDecision;
  const improved =
    candidateDecision.truePositiveCount > baselineDecision.truePositiveCount &&
    candidateDecision.falsePositiveCount <= baselineDecision.falsePositiveCount;
  return decision(
    improved,
    improved ? "improved" : "no_measured_improvement",
    completeDecisionWindows,
    candidateMetrics,
    baselineMetrics
  );
}

function decision(
  eligible: boolean,
  reason: RecurringDetectionPromotionDecision["reason"],
  completeDecisionWindows: number,
  candidateMetrics: RecurrenceDecisionMetrics,
  baselineMetrics: RecurrenceDecisionMetrics
): RecurringDetectionPromotionDecision {
  return {
    detectorVersion: RECURRING_DETECTOR_VERSION,
    eligible,
    completeDecisionWindows,
    minimumDecisionWindows: MINIMUM_PROMOTION_WINDOWS,
    candidateMetrics,
    baselineMetrics,
    reason
  };
}
