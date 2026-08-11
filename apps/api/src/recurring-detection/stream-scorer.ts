import type {
  AlgorithmSufficiency,
  DetectedStreamCadenceEvidence,
  DetectedStreamEvidence,
  DetectedStreamState,
  RecurringDetectionAbstentionReason
} from "@treasury-ops/shared";

import { TRANSACTION_TEXT_NORMALIZER_VERSION } from "../common/transaction-text/normalize-transaction-text.js";
import {
  BASIS_POINTS_SCALE,
  divideRoundHalfAwayFromZero,
  safeIntegerFromBigInt
} from "../common/statistics/index.js";
import { classifyAmountBehavior } from "./amount-behavior.js";
import type { AmountBehaviorResult } from "./amount-behavior.js";
import {
  calendarDayDifference,
  computeNextExpectedDate,
  detectCadence
} from "./cadence-detector.js";
import type { CadenceDetectionResult, CadenceScoreResult } from "./cadence-detector.js";
import {
  CADENCE_DEFINITIONS,
  CANDIDATE_THRESHOLD_BPS,
  MATURE_THRESHOLD_BPS,
  RECURRING_DETECTION_POLICY_VERSION,
  SCORING_WEIGHTS,
  STALE_GRACE_MULTIPLIER
} from "./recurring-detection.constants.js";
import type { StreamGroup } from "./stream-grouping.js";

export interface ScoredStreamMember {
  readonly transactionId: string;
  readonly residualDays: number;
}

export interface ScoredStream {
  readonly group: StreamGroup;
  readonly cadence: CadenceDetectionResult;
  readonly amountBehavior: AmountBehaviorResult;
  readonly confidenceBps: number;
  readonly sufficiency: AlgorithmSufficiency;
  readonly evidence: DetectedStreamEvidence | null;
  readonly state: DetectedStreamState | null;
  readonly abstentionReason: RecurringDetectionAbstentionReason | null;
  readonly nextExpectedDate: string | null;
  readonly members: readonly ScoredStreamMember[];
}

export function scoreStream(group: StreamGroup, asOfDate: string): ScoredStream {
  const dates = group.transactions.map((transaction) => transaction.occurredAt);
  const amounts = group.transactions.map((transaction) => transaction.amountMinor);
  const cadence = detectCadence(dates, asOfDate);
  const amountBehavior = classifyAmountBehavior(amounts);
  const bestScore = cadence.bestScore;
  if (bestScore === null || cadence.bestCadence === null) {
    return {
      group,
      cadence,
      amountBehavior,
      confidenceBps: 0,
      sufficiency: {
        status: "insufficient",
        reason: cadence.ambiguous ? "ambiguous" : "unsupported_series",
        observationCount: group.transactions.length,
        minimumRequired: 2
      },
      evidence: null,
      state: null,
      abstentionReason: cadence.ambiguous ? "ambiguous_cadence" : "irregular_cadence",
      nextExpectedDate: null,
      members: []
    };
  }

  const confidenceBps = computeConfidence(bestScore, amountBehavior, group.textStabilityBps);
  const sortedDates = [...dates].sort();
  const firstDate = sortedDates[0];
  const lastDate = sortedDates.at(-1);
  if (firstDate === undefined || lastDate === undefined) {
    throw new RangeError("recurring stream requires at least two dated observations.");
  }
  const observationSpanDays = calendarDayDifference(lastDate, firstDate);
  const definition = CADENCE_DEFINITIONS[cadence.bestCadence];
  const matureHistory =
    group.transactions.length >= definition.minMatureOccurrences &&
    observationSpanDays >= definition.minSpanDays;
  const nextExpectedDate = computeNextExpectedDate(lastDate, cadence.bestCadence);
  const overdueDays = calendarDayDifference(asOfDate, nextExpectedDate);
  const baseConfidenceBps = Math.min(
    BASIS_POINTS_SCALE,
    confidenceBps + weightedComponent(bestScore.missPenaltyBps, SCORING_WEIGHTS.missPenaltyWeight)
  );

  let state: DetectedStreamState | null = null;
  if (
    matureHistory &&
    baseConfidenceBps >= MATURE_THRESHOLD_BPS &&
    overdueDays > definition.graceDays * STALE_GRACE_MULTIPLIER
  ) {
    state = "stale";
  } else if (matureHistory && confidenceBps >= MATURE_THRESHOLD_BPS) {
    state = "mature";
  } else if (confidenceBps >= CANDIDATE_THRESHOLD_BPS) {
    state = "candidate";
  }

  const sufficiency: AlgorithmSufficiency = {
    status: "sufficient",
    observationCount: group.transactions.length,
    minimumRequired: 2
  };
  const evidence = buildEvidence(
    bestScore,
    cadence.cadenceMarginBps,
    amountBehavior,
    group.textStabilityBps,
    confidenceBps,
    group.transactions.length,
    observationSpanDays
  );

  return {
    group,
    cadence,
    amountBehavior,
    confidenceBps,
    sufficiency,
    evidence,
    state,
    abstentionReason: state === null ? "irregular_cadence" : null,
    nextExpectedDate,
    members: matchedMembers(group, bestScore)
  };
}

function computeConfidence(
  score: CadenceScoreResult,
  amount: AmountBehaviorResult,
  textStabilityBps: number
): number {
  const positive =
    weightedComponent(score.coverageBps, SCORING_WEIGHTS.coverageWeight) +
    weightedComponent(score.dateStabilityBps, SCORING_WEIGHTS.dateStabilityWeight) +
    weightedComponent(amount.stabilityBps, SCORING_WEIGHTS.amountStabilityWeight) +
    weightedComponent(textStabilityBps, SCORING_WEIGHTS.textStabilityWeight);
  const penalty = weightedComponent(score.missPenaltyBps, SCORING_WEIGHTS.missPenaltyWeight);
  return Math.max(0, Math.min(BASIS_POINTS_SCALE, positive - penalty));
}

function weightedComponent(componentBps: number, weight: number): number {
  return safeIntegerFromBigInt(
    divideRoundHalfAwayFromZero(BigInt(componentBps) * BigInt(weight), BigInt(BASIS_POINTS_SCALE)),
    "recurring score component"
  );
}

function buildEvidence(
  score: CadenceScoreResult,
  cadenceMarginBps: number,
  amount: AmountBehaviorResult,
  textStabilityBps: number,
  confidenceBps: number,
  memberCount: number,
  observationSpanDays: number
): DetectedStreamEvidence {
  const cadenceScore: DetectedStreamCadenceEvidence = {
    coverageBps: score.coverageBps,
    dateStabilityBps: score.dateStabilityBps,
    amountStabilityBps: amount.stabilityBps,
    textStabilityBps,
    missPenaltyBps: score.missPenaltyBps,
    cadenceMarginBps,
    expectedSlotCount: score.expectedSlotCount,
    matchedSlotCount: score.matchedSlotCount,
    recentMissCount: score.recentMissCount
  };
  return {
    cadenceScore,
    confidenceBps,
    medianAmountMinor: amount.medianMinor,
    madAmountMinor: amount.madMinor,
    intervalMedianDays: score.intervalMedianDays,
    intervalMadDays: score.intervalMadDays,
    memberCount,
    observationSpanDays,
    normalizerVersion: TRANSACTION_TEXT_NORMALIZER_VERSION,
    scoringPolicyVersion: RECURRING_DETECTION_POLICY_VERSION
  };
}

function matchedMembers(
  group: StreamGroup,
  score: CadenceScoreResult
): readonly ScoredStreamMember[] {
  const available = new Map<string, string[]>();
  for (const transaction of group.transactions) {
    const ids = available.get(transaction.occurredAt) ?? [];
    ids.push(transaction.id);
    available.set(transaction.occurredAt, ids);
  }
  const members: ScoredStreamMember[] = [];
  for (const alignment of score.alignments) {
    const ids = available.get(alignment.observationDate);
    const transactionId = ids?.shift();
    if (transactionId === undefined) continue;
    members.push({ transactionId, residualDays: alignment.residualDays });
  }
  return members;
}
