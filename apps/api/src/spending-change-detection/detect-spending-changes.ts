import {
  type AlgorithmResourceUsage,
  type AlgorithmSufficiency,
  type CusumPointEvidence,
  type DetectedRecurringStreamChange,
  type RecurringAmountChangeEvidence,
  type SpendingChangeDirection,
  type SpendingChangeInputWatermark,
  type SpendingRegime,
  type SpendingRegimeEvidence,
  type TransactionType
} from "@treasury-ops/shared";
import { createHash } from "node:crypto";

import {
  calibrateCusumParameters,
  discreteMedian,
  INITIAL_CUSUM_STATE,
  medianAbsoluteDeviation,
  nextCusumState,
  ratioBasisPoints
} from "../common/statistics/index.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import {
  DETECTOR_VERSION,
  RECURRING_CHANGE_CONFIG,
  SPENDING_CHANGE_RESOURCE_CONTRACT,
  VARIABLE_SPENDING_REGIME_CONFIG
} from "./spending-change-detection.constants.js";

export interface TransactionInput {
  readonly id: string;
  readonly userId: string;
  readonly type: TransactionType;
  readonly amountMinor: number;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly transferGroupId: string | null;
  readonly accountType: string | null;
  readonly billId: string | null;
  readonly status: "posted" | "reversed" | "reversal";
}

export interface StreamMemberInput {
  readonly id: string;
  readonly transactionId: string;
  readonly occurredAt: Date;
  readonly amountMinor: number;
}

export interface MatureStreamInput {
  readonly id: string;
  readonly userId: string;
  readonly logicalKey: string;
  readonly fingerprint: string;
  readonly cadence: "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "annual";
  readonly state: "mature";
  readonly amountBehavior: "fixed" | "variable" | "unknown";
  readonly medianAmountMinor: number;
  readonly madAmountMinor: number;
  readonly members: readonly StreamMemberInput[];
}

export interface SpendingChangeDetectionOptions {
  readonly rowBudgetHit?: boolean;
}

export interface DetectionResult {
  readonly recurringChanges: readonly DetectedRecurringStreamChange[];
  readonly spendingRegimes: readonly SpendingRegime[];
  readonly abstainedCount: number;
  readonly watermark: SpendingChangeInputWatermark;
  readonly sufficiency: AlgorithmSufficiency;
  readonly resources: AlgorithmResourceUsage;
}

function computeInputWatermark(
  rows: readonly TransactionInput[],
  asOf: Date
): SpendingChangeInputWatermark {
  let latestOccurredAt: Date | null = null;
  let latestUpdatedAt: Date | null = null;
  let lastTransactionId: string | null = null;
  const hash = createHash("sha256");

  for (const row of rows) {
    if (latestOccurredAt === null || row.occurredAt > latestOccurredAt) {
      latestOccurredAt = row.occurredAt;
    }
    if (latestUpdatedAt === null || row.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = row.updatedAt;
    }
    lastTransactionId = row.id;
    hash.update(`${row.id}:${row.occurredAt.toISOString()}:${row.amountMinor};`);
  }

  return {
    asOf,
    latestOccurredAt,
    latestUpdatedAt,
    lastTransactionId,
    rowCount: rows.length,
    digest: hash.digest("hex")
  };
}

export function detectRecurringAmountChanges(
  streams: readonly MatureStreamInput[],
  watermark: SpendingChangeInputWatermark,
  userId: string,
  asOf: Date
): { readonly changes: DetectedRecurringStreamChange[]; readonly abstainedCount: number } {
  const changes: DetectedRecurringStreamChange[] = [];
  let abstainedCount = 0;

  for (const stream of streams) {
    // Member transactions sorted strictly chronologically
    const members = [...stream.members].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id.localeCompare(b.id)
    );

    const minRequired =
      RECURRING_CHANGE_CONFIG.minPreShiftObservations +
      RECURRING_CHANGE_CONFIG.minPostShiftObservations;

    if (members.length < minRequired) {
      abstainedCount += 1;
      continue;
    }

    const baselineCount = Math.max(
      RECURRING_CHANGE_CONFIG.minPreShiftObservations,
      Math.min(members.length - RECURRING_CHANGE_CONFIG.minPostShiftObservations, 6)
    );
    const baselineSlice = members.slice(0, baselineCount);
    const baselineAmounts = baselineSlice.map((m) => m.amountMinor);
    const baselineMedianMinor = discreteMedian(baselineAmounts);
    const baselineMadMinor = medianAbsoluteDeviation(baselineAmounts);

    const params = calibrateCusumParameters(baselineMadMinor, baselineMedianMinor, {
      allowanceRatioBps: 5_000,
      thresholdRatioBps: 35_000,
      floorAllowanceMinor: 200,
      floorThresholdMinor: 2_000
    });

    const cusumStates: CusumPointEvidence[] = [];
    let state = INITIAL_CUSUM_STATE;
    let upperTriggerCount = 0;
    let lowerTriggerCount = 0;
    let candidateShiftIndex: number | null = null;
    let candidateDirection: SpendingChangeDirection | null = null;

    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      if (!member) continue;
      const deviation = member.amountMinor - baselineMedianMinor;
      state = nextCusumState(state, deviation, params);

      cusumStates.push({
        index: i,
        amountMinor: member.amountMinor,
        deviationMinor: deviation,
        upperMinor: state.upperMinor,
        lowerMinor: state.lowerMinor,
        upperTriggered: state.upperTriggered,
        lowerTriggered: state.lowerTriggered
      });

      if (state.upperTriggered) {
        upperTriggerCount += 1;
        lowerTriggerCount = 0;
        if (candidateShiftIndex === null) {
          candidateShiftIndex = findShiftStartIndex(members, i, baselineMedianMinor, "increase");
          candidateDirection = "increase";
        }
      } else if (state.lowerTriggered) {
        lowerTriggerCount += 1;
        upperTriggerCount = 0;
        if (candidateShiftIndex === null) {
          candidateShiftIndex = findShiftStartIndex(members, i, baselineMedianMinor, "decrease");
          candidateDirection = "decrease";
        }
      } else {
        // Reset trigger counter if CUSUM falls back below threshold
        upperTriggerCount = 0;
        lowerTriggerCount = 0;
        candidateShiftIndex = null;
        candidateDirection = null;
      }

      // Check persistence
      const isPersistent =
        (upperTriggerCount >= RECURRING_CHANGE_CONFIG.minPersistenceStates &&
          candidateDirection === "increase") ||
        (lowerTriggerCount >= RECURRING_CHANGE_CONFIG.minPersistenceStates &&
          candidateDirection === "decrease");

      if (isPersistent && candidateShiftIndex !== null && candidateDirection !== null) {
        const preShiftMembers = members.slice(0, candidateShiftIndex);
        const postShiftMembers = members.slice(candidateShiftIndex);

        if (
          preShiftMembers.length >= RECURRING_CHANGE_CONFIG.minPreShiftObservations &&
          postShiftMembers.length >= RECURRING_CHANGE_CONFIG.minPostShiftObservations
        ) {
          const postAmounts = postShiftMembers.map((m) => m.amountMinor);
          const newMedianMinor = discreteMedian(postAmounts);
          const newMadMinor = medianAbsoluteDeviation(postAmounts);
          const deltaMinor = Math.abs(newMedianMinor - baselineMedianMinor);
          const deltaBps = ratioBasisPoints(deltaMinor, baselineMedianMinor);

          if (
            deltaMinor >= RECURRING_CHANGE_CONFIG.minAbsoluteDeltaMinor &&
            deltaBps >= RECURRING_CHANGE_CONFIG.minRelativeDeltaBps
          ) {
            const shiftMember = members[candidateShiftIndex];
            if (!shiftMember) continue;
            const persistenceCount = Math.max(upperTriggerCount, lowerTriggerCount);

            // Calibrated confidence (70% - 98%) based on persistence and sample depth
            const confidenceBps = Math.min(
              9_800,
              Math.max(
                7_000,
                7_000 + persistenceCount * 500 + Math.min(1_000, postShiftMembers.length * 200)
              )
            );

            const evidence: RecurringAmountChangeEvidence = {
              baselineMedianMinor,
              baselineMadMinor,
              newMedianMinor,
              newMadMinor,
              deltaMinor,
              deltaBps,
              direction: candidateDirection,
              confidenceBps,
              preShiftCount: preShiftMembers.length,
              postShiftCount: postShiftMembers.length,
              persistenceCount,
              changeOccurredAt: shiftMember.occurredAt,
              changeTransactionId: shiftMember.transactionId,
              referenceAllowanceMinor: params.referenceAllowanceMinor,
              decisionThresholdMinor: params.decisionThresholdMinor,
              cusumStates,
              detectorVersion: DETECTOR_VERSION
            };

            changes.push({
              id: crypto.randomUUID(),
              userId,
              streamId: stream.id,
              supersedesStreamId: null,
              oldMedianMinor: baselineMedianMinor,
              newMedianMinor,
              deltaMinor,
              direction: candidateDirection,
              confidenceBps,
              changeOccurredAt: shiftMember.occurredAt,
              changeTransactionId: shiftMember.transactionId,
              evidence,
              inputWatermark: watermark,
              detectorVersion: DETECTOR_VERSION,
              computedAt: asOf
            });

            break; // Record first confirmed persistent change for this stream
          }
        }
      }
    }
  }

  return { changes, abstainedCount };
}

function findShiftStartIndex(
  members: readonly StreamMemberInput[],
  triggerIndex: number,
  baselineMedian: number,
  direction: SpendingChangeDirection
): number {
  let startIndex = triggerIndex;
  for (let j = triggerIndex; j >= 0; j--) {
    const item = members[j];
    if (!item) break;
    const amt = item.amountMinor;
    if (direction === "increase" && amt > baselineMedian) {
      startIndex = j;
    } else if (direction === "decrease" && amt < baselineMedian) {
      startIndex = j;
    } else {
      break;
    }
  }
  return startIndex;
}

export function detectVariableSpendingRegimes(
  rows: readonly TransactionInput[],
  recurringTransactionIds: ReadonlySet<string>,
  watermark: SpendingChangeInputWatermark,
  userId: string,
  asOf: Date
): { readonly regimes: SpendingRegime[]; readonly abstained: boolean } {
  // 1. Filter discretionary variable expense transactions
  const variableExpenses = rows.filter((r) => {
    if (r.type !== "expense") return false;
    if (r.status !== "posted") return false;
    if (r.transferGroupId !== null) return false;
    if (r.accountType === "credit_card" || r.billId !== null) return false;
    if (recurringTransactionIds.has(r.id)) return false;
    return true;
  });

  const minRequiredObservations =
    (VARIABLE_SPENDING_REGIME_CONFIG.minBaselineBuckets +
      VARIABLE_SPENDING_REGIME_CONFIG.minPostShiftBuckets) *
    2;

  if (variableExpenses.length < minRequiredObservations) {
    return { regimes: [], abstained: true };
  }

  // 2. Aggregate into chronological 7-day (weekly) IST periods
  const lookbackStart = new Date(
    asOf.getTime() - SPENDING_CHANGE_RESOURCE_CONTRACT.lookbackDays * 86_400_000
  );

  let earliestOccurredAt = asOf;
  for (const exp of variableExpenses) {
    if (exp.occurredAt >= lookbackStart && exp.occurredAt < earliestOccurredAt) {
      earliestOccurredAt = exp.occurredAt;
    }
  }

  const bucketStart = earliestOccurredAt;
  const periodSums = new Map<number, number>();

  for (const exp of variableExpenses) {
    if (exp.occurredAt < bucketStart || exp.occurredAt > asOf) continue;
    const diffDays = Math.floor(
      (exp.occurredAt.getTime() - bucketStart.getTime()) / (86_400_000 * 7)
    );
    periodSums.set(diffDays, (periodSums.get(diffDays) ?? 0) + exp.amountMinor);
  }

  const maxPeriodIndex = Math.floor((asOf.getTime() - bucketStart.getTime()) / (86_400_000 * 7));

  const bucketSeries: Array<{ index: number; amountMinor: number; startDate: Date }> = [];
  for (let p = 0; p <= maxPeriodIndex; p++) {
    const amountMinor = periodSums.get(p) ?? 0;
    const startDate = new Date(bucketStart.getTime() + p * 7 * 86_400_000);
    bucketSeries.push({ index: p, amountMinor, startDate });
  }

  if (
    bucketSeries.length <
    VARIABLE_SPENDING_REGIME_CONFIG.minBaselineBuckets +
      VARIABLE_SPENDING_REGIME_CONFIG.minPostShiftBuckets
  ) {
    return { regimes: [], abstained: true };
  }

  // 3. Baseline estimation on initial buckets
  const baselineBuckets = bucketSeries.slice(0, VARIABLE_SPENDING_REGIME_CONFIG.minBaselineBuckets);
  const baselineAmounts = baselineBuckets.map((b) => b.amountMinor);
  const baselineMedianMinor = discreteMedian(baselineAmounts);
  const baselineMadMinor = medianAbsoluteDeviation(baselineAmounts);

  if (baselineMedianMinor <= 0) {
    return { regimes: [], abstained: true };
  }

  const params = calibrateCusumParameters(baselineMadMinor, baselineMedianMinor, {
    allowanceRatioBps: 5_000,
    thresholdRatioBps: 30_000,
    floorAllowanceMinor: 2_000,
    floorThresholdMinor: 20_000
  });

  const cusumStates: CusumPointEvidence[] = [];
  let state = INITIAL_CUSUM_STATE;
  let upperTriggerCount = 0;
  let lowerTriggerCount = 0;
  let candidateShiftIndex: number | null = null;
  let candidateDirection: SpendingChangeDirection | null = null;
  const regimes: SpendingRegime[] = [];

  for (let i = 0; i < bucketSeries.length; i++) {
    const bucket = bucketSeries[i];
    if (!bucket) continue;
    const deviation = bucket.amountMinor - baselineMedianMinor;
    state = nextCusumState(state, deviation, params);

    cusumStates.push({
      index: i,
      amountMinor: bucket.amountMinor > 0 ? bucket.amountMinor : 1,
      deviationMinor: deviation,
      upperMinor: state.upperMinor,
      lowerMinor: state.lowerMinor,
      upperTriggered: state.upperTriggered,
      lowerTriggered: state.lowerTriggered
    });

    if (state.upperTriggered) {
      upperTriggerCount += 1;
      lowerTriggerCount = 0;
      if (candidateShiftIndex === null) {
        candidateShiftIndex = i;
        candidateDirection = "increase";
      }
    } else if (state.lowerTriggered) {
      lowerTriggerCount += 1;
      upperTriggerCount = 0;
      if (candidateShiftIndex === null) {
        candidateShiftIndex = i;
        candidateDirection = "decrease";
      }
    } else {
      upperTriggerCount = 0;
      lowerTriggerCount = 0;
      candidateShiftIndex = null;
      candidateDirection = null;
    }

    const isPersistent =
      (upperTriggerCount >= VARIABLE_SPENDING_REGIME_CONFIG.minPersistenceBuckets &&
        candidateDirection === "increase") ||
      (lowerTriggerCount >= VARIABLE_SPENDING_REGIME_CONFIG.minPersistenceBuckets &&
        candidateDirection === "decrease");

    if (isPersistent && candidateShiftIndex !== null && candidateDirection !== null) {
      const preShift = bucketSeries.slice(0, candidateShiftIndex);
      const postShift = bucketSeries.slice(candidateShiftIndex);

      if (
        preShift.length >= VARIABLE_SPENDING_REGIME_CONFIG.minBaselineBuckets &&
        postShift.length >= VARIABLE_SPENDING_REGIME_CONFIG.minPostShiftBuckets
      ) {
        const postAmounts = postShift.map((b) => b.amountMinor);
        const newMedianMinor = discreteMedian(postAmounts);
        const newMadMinor = medianAbsoluteDeviation(postAmounts);
        const deltaMinor = Math.abs(newMedianMinor - baselineMedianMinor);
        const deltaBps = ratioBasisPoints(deltaMinor, baselineMedianMinor);

        if (
          deltaMinor >= VARIABLE_SPENDING_REGIME_CONFIG.minAbsoluteDeltaMinor &&
          deltaBps >= VARIABLE_SPENDING_REGIME_CONFIG.minRelativeDeltaBps
        ) {
          const shiftBucket = bucketSeries[candidateShiftIndex];
          if (!shiftBucket) continue;
          const persistenceCount = Math.max(upperTriggerCount, lowerTriggerCount);

          const confidenceBps = Math.min(
            9_500,
            Math.max(
              6_500,
              6_500 + persistenceCount * 600 + Math.min(1_000, postShift.length * 200)
            )
          );

          const evidence: SpendingRegimeEvidence = {
            baselineMedianMinor,
            baselineMadMinor,
            newMedianMinor,
            newMadMinor,
            deltaMinor,
            deltaBps,
            direction: candidateDirection,
            confidenceBps,
            baselinePeriods: preShift.length,
            postShiftPeriods: postShift.length,
            persistencePeriods: persistenceCount,
            referenceAllowanceMinor: params.referenceAllowanceMinor,
            decisionThresholdMinor: params.decisionThresholdMinor,
            periodUnit: "weekly",
            cusumStates,
            detectorVersion: DETECTOR_VERSION
          };

          regimes.push({
            id: crypto.randomUUID(),
            userId,
            regimeType: "variable_spending",
            baselineMedianMinor,
            newMedianMinor: Math.max(1, newMedianMinor),
            deltaMinor,
            direction: candidateDirection,
            confidenceBps,
            sufficiency: {
              status: "sufficient",
              observationCount: variableExpenses.length,
              minimumRequired: minRequiredObservations
            },
            changeDate: toISTCalendarDate(shiftBucket.startDate),
            occurredAtStart: lookbackStart,
            occurredAtEnd: asOf,
            evidence,
            inputWatermark: watermark,
            supersedesRegimeId: null,
            detectorVersion: DETECTOR_VERSION,
            computedAt: asOf
          });

          break; // Record first confirmed regime shift
        }
      }
    }
  }

  return { regimes, abstained: false };
}

export function detectSpendingChanges(
  rows: readonly TransactionInput[],
  matureStreams: readonly MatureStreamInput[],
  userId: string,
  asOf: Date,
  options: SpendingChangeDetectionOptions = {}
): DetectionResult {
  const startedAt = Date.now();
  const watermark = computeInputWatermark(rows, asOf);

  const recurringTxnIds = new Set<string>();
  for (const stream of matureStreams) {
    for (const m of stream.members) {
      recurringTxnIds.add(m.transactionId);
    }
  }

  const { changes: recurringChanges, abstainedCount: streamAbstainedCount } =
    detectRecurringAmountChanges(matureStreams, watermark, userId, asOf);

  const { regimes: spendingRegimes, abstained: regimeAbstained } = detectVariableSpendingRegimes(
    rows,
    recurringTxnIds,
    watermark,
    userId,
    asOf
  );

  const totalAbstained = streamAbstainedCount + (regimeAbstained ? 1 : 0);
  const runtimeMs = Date.now() - startedAt;

  const isDegraded = options.rowBudgetHit ?? false;
  const minRequired = 5;
  const observationCount = Math.max(rows.length, matureStreams.length);
  const isSufficient = rows.length >= minRequired || matureStreams.length > 0;
  const sufficiency: AlgorithmSufficiency = isSufficient
    ? {
        status: "sufficient",
        observationCount,
        minimumRequired: minRequired
      }
    : {
        status: "insufficient",
        reason: "insufficient_history",
        observationCount,
        minimumRequired: minRequired
      };

  const outcome = isDegraded
    ? ({ status: "degraded", reason: "resource_limit" } as const)
    : sufficiency.status === "insufficient"
      ? ({ status: "abstained", reason: "insufficient_history" } as const)
      : ({ status: "completed" } as const);

  const resources: AlgorithmResourceUsage = {
    rowsScanned: rows.length,
    runtimeMs,
    rowBudgetHit: isDegraded,
    timedOut: false,
    outcome
  };

  return {
    recurringChanges,
    spendingRegimes,
    abstainedCount: totalAbstained,
    watermark,
    sufficiency,
    resources
  };
}
