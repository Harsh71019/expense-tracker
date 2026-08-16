import type {
  BinaryDecisionMetrics,
  BudgetDecisionMetrics,
  CategoryDecisionMetrics,
  ForecastDecisionMetrics,
  RecurrenceDecisionMetrics,
  ShortfallDecisionMetrics,
  SpendingChangeDecisionMetrics,
  WarningDecisionMetrics
} from "@treasury-ops/shared";

import {
  boundedRatioBasisPoints,
  divideRoundHalfAwayFromZero,
  ratioBasisPoints,
  requireSafeInteger,
  safeIntegerFromBigInt
} from "../statistics/index.js";

const MILLISECONDS_PER_DAY = 86_400_000;

export interface BinaryDecisionObservation {
  readonly actual: boolean;
  readonly predicted: boolean;
}

export interface CategoryDecisionObservation {
  readonly actualLabel: string;
  readonly predictedLabel: string | null;
  readonly amountMinor: number;
}

export interface ForecastDecisionObservation {
  readonly actualMinor: number;
  readonly predictedMinor: number;
  readonly baselinePredictedMinor: number;
  readonly lowerMinor: number;
  readonly upperMinor: number;
}

export interface RecurrenceDecisionObservation {
  readonly actualMature: boolean;
  readonly predictedMature: boolean;
  readonly actualNextDate: string | null;
  readonly predictedNextDate: string | null;
  readonly actualNextAmountMinor: number | null;
  readonly predictedNextAmountMinor: number | null;
  readonly missedPaymentLeadDays: number | null;
  readonly reviewOutcome: "accepted" | "rejected" | "unreviewed";
}

export interface ShortfallDecisionObservation {
  readonly decisionDate: string;
  readonly actualFirstShortfallDate: string | null;
  readonly predictedFirstShortfallDate: string | null;
}

export interface BudgetDecisionObservation {
  readonly actualBreach: boolean;
  readonly predictedBreach: boolean;
  /** Positive before the breach; negative when the warning came too late. */
  readonly warningLeadDays: number | null;
}

export interface SpendingChangeDecisionObservation {
  readonly actualChange: boolean;
  readonly predictedChange: boolean;
  readonly lagDays: number | null;
  readonly actualNewMedianMinor: number | null;
  readonly predictedNewMedianMinor: number | null;
}

export interface WarningDecisionObservation {
  readonly outcome: "confirmed" | "dismissed" | "unresolved";
  readonly amountAtRiskMinor: number;
}

function requireNonNegativeSafeInteger(value: number, label: string): void {
  requireSafeInteger(value, label);
  if (value < 0) {
    throw new RangeError(`${label} must be non-negative.`);
  }
}

function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : boundedRatioBasisPoints(numerator, denominator);
}

function bigintRatioBasisPoints(numerator: bigint, denominator: bigint, label: string): number {
  return safeIntegerFromBigInt(
    divideRoundHalfAwayFromZero(numerator * 10_000n, denominator),
    label
  );
}

function absoluteDifference(left: number, right: number, label: string): number {
  requireSafeInteger(left, `${label} left`);
  requireSafeInteger(right, `${label} right`);
  const difference = BigInt(left) - BigInt(right);
  return safeIntegerFromBigInt(difference < 0n ? -difference : difference, label);
}

function roundedMean(values: readonly number[], label: string): number | null {
  if (values.length === 0) return null;
  let total = 0n;
  for (const value of values) {
    requireNonNegativeSafeInteger(value, label);
    total += BigInt(value);
  }
  return safeIntegerFromBigInt(
    divideRoundHalfAwayFromZero(total, BigInt(values.length)),
    `${label} mean`
  );
}

function parseCalendarDate(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`${label} must be a YYYY-MM-DD calendar date.`);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const timestamp = Date.UTC(year, month - 1, day);
  const normalized = new Date(timestamp).toISOString().slice(0, 10);
  if (normalized !== value) {
    throw new RangeError(`${label} must be a valid calendar date.`);
  }
  return timestamp;
}

function calendarDayDifference(left: string, right: string, label: string): number {
  const difference =
    (parseCalendarDate(left, `${label} left`) - parseCalendarDate(right, `${label} right`)) /
    MILLISECONDS_PER_DAY;
  requireSafeInteger(difference, label);
  return difference;
}

export function calculateBinaryDecisionMetrics(
  observations: readonly BinaryDecisionObservation[]
): BinaryDecisionMetrics {
  let truePositiveCount = 0;
  let falsePositiveCount = 0;
  let falseNegativeCount = 0;
  let trueNegativeCount = 0;

  for (const observation of observations) {
    if (observation.actual && observation.predicted) truePositiveCount += 1;
    else if (!observation.actual && observation.predicted) falsePositiveCount += 1;
    else if (observation.actual) falseNegativeCount += 1;
    else trueNegativeCount += 1;
  }

  return {
    observationCount: observations.length,
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    trueNegativeCount,
    precisionBps: ratioOrNull(truePositiveCount, truePositiveCount + falsePositiveCount),
    recallBps: ratioOrNull(truePositiveCount, truePositiveCount + falseNegativeCount)
  };
}

export function calculateCategoryDecisionMetrics(
  observations: readonly CategoryDecisionObservation[]
): CategoryDecisionMetrics {
  let predictedCount = 0;
  let correctCount = 0;
  let eligibleAmount = 0n;
  let correctAmount = 0n;

  for (const observation of observations) {
    if (observation.actualLabel.length === 0) {
      throw new RangeError("actualLabel must not be empty.");
    }
    requireNonNegativeSafeInteger(observation.amountMinor, "category amountMinor");
    eligibleAmount += BigInt(observation.amountMinor);
    if (observation.predictedLabel !== null) {
      if (observation.predictedLabel.length === 0) {
        throw new RangeError("predictedLabel must be null or non-empty.");
      }
      predictedCount += 1;
      if (observation.predictedLabel === observation.actualLabel) {
        correctCount += 1;
        correctAmount += BigInt(observation.amountMinor);
      }
    }
  }

  return {
    eligibleCount: observations.length,
    predictedCount,
    correctCount,
    top1PrecisionBps: ratioOrNull(correctCount, predictedCount),
    coverageBps:
      observations.length === 0 ? 0 : boundedRatioBasisPoints(predictedCount, observations.length),
    amountWeightedAccuracyBps:
      eligibleAmount === 0n
        ? null
        : bigintRatioBasisPoints(correctAmount, eligibleAmount, "category amount-weighted accuracy")
  };
}

export function calculateForecastDecisionMetrics(
  observations: readonly ForecastDecisionObservation[]
): ForecastDecisionMetrics {
  const errors: number[] = [];
  const baselineErrors: number[] = [];
  const intervalWidths: number[] = [];
  const eventObservations: BinaryDecisionObservation[] = [];
  let coveredCount = 0;

  for (const observation of observations) {
    requireSafeInteger(observation.actualMinor, "forecast actualMinor");
    requireSafeInteger(observation.predictedMinor, "forecast predictedMinor");
    requireSafeInteger(observation.baselinePredictedMinor, "forecast baselinePredictedMinor");
    requireSafeInteger(observation.lowerMinor, "forecast lowerMinor");
    requireSafeInteger(observation.upperMinor, "forecast upperMinor");
    if (observation.lowerMinor > observation.upperMinor) {
      throw new RangeError("forecast lowerMinor must not exceed upperMinor.");
    }

    errors.push(
      absoluteDifference(observation.actualMinor, observation.predictedMinor, "forecast error")
    );
    baselineErrors.push(
      absoluteDifference(
        observation.actualMinor,
        observation.baselinePredictedMinor,
        "forecast baseline error"
      )
    );
    intervalWidths.push(
      safeIntegerFromBigInt(
        BigInt(observation.upperMinor) - BigInt(observation.lowerMinor),
        "forecast interval width"
      )
    );
    if (
      observation.actualMinor >= observation.lowerMinor &&
      observation.actualMinor <= observation.upperMinor
    ) {
      coveredCount += 1;
    }
    eventObservations.push({
      actual: observation.actualMinor !== 0,
      predicted: observation.predictedMinor !== 0
    });
  }

  const maeMinor = roundedMean(errors, "forecast error");
  const baselineMaeMinor = roundedMean(baselineErrors, "forecast baseline error");
  return {
    observationCount: observations.length,
    maeMinor,
    baselineMaeMinor,
    maseBps:
      maeMinor === null || baselineMaeMinor === null || baselineMaeMinor === 0
        ? null
        : ratioBasisPoints(maeMinor, baselineMaeMinor),
    eventOccurrence: calculateBinaryDecisionMetrics(eventObservations),
    intervalCoverageBps:
      observations.length === 0 ? null : boundedRatioBasisPoints(coveredCount, observations.length),
    meanIntervalWidthMinor: roundedMean(intervalWidths, "forecast interval width")
  };
}

export function calculateRecurrenceDecisionMetrics(
  observations: readonly RecurrenceDecisionObservation[]
): RecurrenceDecisionMetrics {
  const matureStreamObservations: BinaryDecisionObservation[] = [];
  const nextDateErrors: number[] = [];
  const nextAmountErrors: number[] = [];
  const missedPaymentLeadDays: number[] = [];
  let acceptedCount = 0;
  let rejectedCount = 0;
  let unreviewedCount = 0;

  for (const observation of observations) {
    matureStreamObservations.push({
      actual: observation.actualMature,
      predicted: observation.predictedMature
    });
    if (observation.actualNextDate !== null && observation.predictedNextDate !== null) {
      nextDateErrors.push(
        Math.abs(
          calendarDayDifference(
            observation.actualNextDate,
            observation.predictedNextDate,
            "recurrence next-date error"
          )
        )
      );
    }
    if (
      observation.actualNextAmountMinor !== null &&
      observation.predictedNextAmountMinor !== null
    ) {
      nextAmountErrors.push(
        absoluteDifference(
          observation.actualNextAmountMinor,
          observation.predictedNextAmountMinor,
          "recurrence next-amount error"
        )
      );
    }
    if (observation.missedPaymentLeadDays !== null) {
      requireNonNegativeSafeInteger(
        observation.missedPaymentLeadDays,
        "recurrence missedPaymentLeadDays"
      );
      missedPaymentLeadDays.push(observation.missedPaymentLeadDays);
    }
    if (observation.reviewOutcome === "accepted") acceptedCount += 1;
    else if (observation.reviewOutcome === "rejected") rejectedCount += 1;
    else unreviewedCount += 1;
  }

  const reviewedCount = acceptedCount + rejectedCount;
  return {
    matureStreamDecision: calculateBinaryDecisionMetrics(matureStreamObservations),
    nextDateMaeDays: roundedMean(nextDateErrors, "recurrence next-date error"),
    nextAmountMaeMinor: roundedMean(nextAmountErrors, "recurrence next-amount error"),
    missedPaymentMeanLeadDays: roundedMean(missedPaymentLeadDays, "recurrence missed-payment lead"),
    acceptedCount,
    rejectedCount,
    unreviewedCount,
    acceptanceRateBps: ratioOrNull(acceptedCount, reviewedCount),
    rejectionRateBps: ratioOrNull(rejectedCount, reviewedCount)
  };
}

export function calculateShortfallDecisionMetrics(
  observations: readonly ShortfallDecisionObservation[]
): ShortfallDecisionMetrics {
  const decisionObservations: BinaryDecisionObservation[] = [];
  const leadDays: number[] = [];
  const dateErrors: number[] = [];

  for (const observation of observations) {
    const actual = observation.actualFirstShortfallDate !== null;
    const predicted = observation.predictedFirstShortfallDate !== null;
    decisionObservations.push({ actual, predicted });

    if (observation.actualFirstShortfallDate !== null) {
      const actualLeadDays = calendarDayDifference(
        observation.actualFirstShortfallDate,
        observation.decisionDate,
        "shortfall warning lead"
      );
      if (actualLeadDays < 0) {
        throw new RangeError("shortfall decisionDate must not follow the actual shortfall date.");
      }
      if (observation.predictedFirstShortfallDate !== null) {
        leadDays.push(actualLeadDays);
        dateErrors.push(
          Math.abs(
            calendarDayDifference(
              observation.actualFirstShortfallDate,
              observation.predictedFirstShortfallDate,
              "shortfall first-date error"
            )
          )
        );
      }
    } else {
      parseCalendarDate(observation.decisionDate, "shortfall decisionDate");
      if (observation.predictedFirstShortfallDate !== null) {
        parseCalendarDate(observation.predictedFirstShortfallDate, "shortfall predicted date");
      }
    }
  }

  return {
    shortfallDecision: calculateBinaryDecisionMetrics(decisionObservations),
    meanWarningLeadDays: roundedMean(leadDays, "shortfall warning lead"),
    firstShortfallDateMaeDays: roundedMean(dateErrors, "shortfall first-date error")
  };
}

export function calculateBudgetDecisionMetrics(
  observations: readonly BudgetDecisionObservation[]
): BudgetDecisionMetrics {
  const decisionObservations: BinaryDecisionObservation[] = [];
  const leadDays: number[] = [];
  let postBreachWarningCount = 0;

  for (const observation of observations) {
    decisionObservations.push({
      actual: observation.actualBreach,
      predicted: observation.predictedBreach
    });
    if (observation.warningLeadDays !== null) {
      requireSafeInteger(observation.warningLeadDays, "budget warningLeadDays");
      if (!observation.actualBreach || !observation.predictedBreach) {
        throw new RangeError("budget warningLeadDays requires an actual and predicted breach.");
      }
      if (observation.warningLeadDays < 0) postBreachWarningCount += 1;
      else leadDays.push(observation.warningLeadDays);
    }
  }

  return {
    breachDecision: calculateBinaryDecisionMetrics(decisionObservations),
    meanWarningLeadDays: roundedMean(leadDays, "budget warning lead"),
    postBreachWarningCount
  };
}

export function calculateWarningDecisionMetrics(
  observations: readonly WarningDecisionObservation[]
): WarningDecisionMetrics {
  let confirmedCount = 0;
  let dismissedCount = 0;
  let unresolvedCount = 0;
  let totalAmountAtRiskMinor = 0n;

  for (const observation of observations) {
    requireNonNegativeSafeInteger(observation.amountAtRiskMinor, "warning amountAtRiskMinor");
    totalAmountAtRiskMinor += BigInt(observation.amountAtRiskMinor);
    if (observation.outcome === "confirmed") confirmedCount += 1;
    else if (observation.outcome === "dismissed") dismissedCount += 1;
    else unresolvedCount += 1;
  }

  const resolvedCount = confirmedCount + dismissedCount;
  return {
    warningCount: observations.length,
    confirmedCount,
    dismissedCount,
    unresolvedCount,
    confirmedUsefulnessBps: ratioOrNull(confirmedCount, resolvedCount),
    dismissRateBps: ratioOrNull(dismissedCount, resolvedCount),
    totalAmountAtRiskMinor: safeIntegerFromBigInt(
      totalAmountAtRiskMinor,
      "warning totalAmountAtRiskMinor"
    )
  };
}

export function calculateSpendingChangeDecisionMetrics(
  observations: readonly SpendingChangeDecisionObservation[]
): SpendingChangeDecisionMetrics {
  const binaryObservations: BinaryDecisionObservation[] = [];
  const lagDaysList: number[] = [];
  const magnitudeErrorsMinor: number[] = [];
  let falsePositiveCount = 0;

  for (const observation of observations) {
    binaryObservations.push({
      actual: observation.actualChange,
      predicted: observation.predictedChange
    });

    if (!observation.actualChange && observation.predictedChange) {
      falsePositiveCount += 1;
    }

    if (observation.actualChange && observation.predictedChange) {
      if (observation.lagDays !== null) {
        requireSafeInteger(observation.lagDays, "change detection lagDays");
        lagDaysList.push(Math.abs(observation.lagDays));
      }
      if (
        observation.actualNewMedianMinor !== null &&
        observation.predictedNewMedianMinor !== null
      ) {
        requireSafeInteger(observation.actualNewMedianMinor, "actualNewMedianMinor");
        requireSafeInteger(observation.predictedNewMedianMinor, "predictedNewMedianMinor");
        magnitudeErrorsMinor.push(
          Math.abs(observation.actualNewMedianMinor - observation.predictedNewMedianMinor)
        );
      }
    }
  }

  const binary = calculateBinaryDecisionMetrics(binaryObservations);
  const falseChangePointRateBps =
    observations.length > 0 ? ratioBasisPoints(falsePositiveCount, observations.length) : null;

  return {
    changeDecision: binary,
    meanLagDays: roundedMean(lagDaysList, "change detection lag days"),
    meanMagnitudeErrorMinor: roundedMean(magnitudeErrorsMinor, "change magnitude error"),
    falseChangePointRateBps
  };
}
