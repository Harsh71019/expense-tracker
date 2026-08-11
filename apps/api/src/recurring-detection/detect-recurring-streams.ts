import type {
  AlgorithmResourceUsage,
  AlgorithmSufficiency,
  DetectedStreamAmountBehavior,
  DetectedStreamCadence,
  DetectedStreamEvidence,
  DetectedStreamState,
  RecurringDetectionAbstentionReason,
  RecurringDetectionInputWatermark,
  RecurringDetectionRunStatus
} from "@treasury-ops/shared";

import { toISTCalendarDate } from "../common/time/ist.js";
import { TRANSACTION_TEXT_NORMALIZER_VERSION } from "../common/transaction-text/normalize-transaction-text.js";
import {
  MINIMUM_OBSERVATIONS,
  RECURRING_DETECTION_RESOURCE_CONTRACT,
  RECURRING_DETECTOR_VERSION
} from "./recurring-detection.constants.js";
import { computeStreamFingerprint, computeStreamLogicalKey, sha256 } from "./stream-fingerprint.js";
import { groupTransactionsForRecurrence } from "./stream-grouping.js";
import type { TransactionForGrouping } from "./stream-grouping.js";
import { scoreStream } from "./stream-scorer.js";

export interface TransactionInput {
  readonly id: string;
  readonly userId: string;
  readonly type: "expense" | "income";
  readonly description: string;
  readonly amountMinor: number;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DetectedStreamOutput {
  readonly logicalKey: string;
  readonly fingerprint: string;
  readonly detectorVersion: number;
  readonly transactionType: "expense" | "income";
  readonly counterpartyKey: string;
  readonly cadence: DetectedStreamCadence;
  readonly state: DetectedStreamState;
  readonly amountBehavior: DetectedStreamAmountBehavior;
  readonly confidenceBps: number;
  readonly sufficiency: AlgorithmSufficiency;
  readonly evidence: DetectedStreamEvidence;
  readonly medianAmountMinor: number;
  readonly madAmountMinor: number;
  readonly nextExpectedDate: string;
  readonly inputWatermark: RecurringDetectionInputWatermark;
  readonly members: readonly Readonly<{ transactionId: string; residualDays: number }>[];
}

export interface DetectionSummary {
  readonly detectorVersion: number;
  readonly status: Exclude<RecurringDetectionRunStatus, "running" | "failed">;
  readonly inputWatermark: RecurringDetectionInputWatermark;
  readonly sufficiency: AlgorithmSufficiency;
  readonly resources: AlgorithmResourceUsage;
  readonly candidateCount: number;
  readonly matureCount: number;
  readonly staleCount: number;
  readonly abstainedGroupCount: number;
  readonly abstentionCounts: Readonly<Record<RecurringDetectionAbstentionReason, number>>;
}

export interface DetectionResult {
  readonly summary: DetectionSummary;
  readonly streams: readonly DetectedStreamOutput[];
}

export interface DetectionExecutionOptions {
  readonly rowBudgetHit?: boolean;
  readonly clock?: () => number;
}

/** Pure, bounded shadow detector. It never performs IO or mutates ledger state. */
export function detectRecurringStreams(
  transactions: readonly TransactionInput[],
  userId: string,
  asOf: Date,
  options: DetectionExecutionOptions = {}
): DetectionResult {
  const clock = options.clock ?? (() => performance.now());
  const startedAt = clock();
  const bounded = transactions.filter((transaction) => {
    if (transaction.userId !== userId) {
      throw new RangeError("recurring detector received another tenant's transaction.");
    }
    return (
      transaction.occurredAt <= asOf &&
      transaction.createdAt <= asOf &&
      transaction.updatedAt <= asOf
    );
  });
  const inputWatermark = computeInputWatermark(bounded, asOf);
  const abstentionCounts = emptyAbstentionCounts();
  const rowBudgetHit = options.rowBudgetHit === true;

  if (bounded.length < MINIMUM_OBSERVATIONS) {
    abstentionCounts.insufficient_history = 1;
    return resultWithoutStreams({
      status: "abstained",
      reason: "insufficient_history",
      rowsScanned: bounded.length,
      runtimeMs: elapsed(clock, startedAt),
      rowBudgetHit,
      inputWatermark,
      sufficiency: {
        status: "insufficient",
        reason: "insufficient_history",
        observationCount: bounded.length,
        minimumRequired: MINIMUM_OBSERVATIONS
      },
      abstentionCounts
    });
  }

  const groupingInput: TransactionForGrouping[] = bounded.map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    description: transaction.description,
    amountMinor: transaction.amountMinor,
    occurredAt: toISTCalendarDate(transaction.occurredAt)
  }));
  const grouping = groupTransactionsForRecurrence(groupingInput);
  abstentionCounts.missing_counterparty = grouping.missingCounterpartyCount;
  const streams: DetectedStreamOutput[] = [];
  const asOfDate = toISTCalendarDate(asOf);

  for (const group of grouping.groups) {
    if (clock() - startedAt >= RECURRING_DETECTION_RESOURCE_CONTRACT.timeoutMs) {
      abstentionCounts.timeout += 1;
      return buildResult(
        streams,
        "degraded",
        "timeout",
        bounded.length,
        elapsed(clock, startedAt),
        rowBudgetHit,
        inputWatermark,
        abstentionCounts
      );
    }

    const scored = scoreStream(group, asOfDate);
    if (
      scored.state === null ||
      scored.cadence.bestCadence === null ||
      scored.evidence === null ||
      scored.nextExpectedDate === null
    ) {
      if (scored.abstentionReason !== null) abstentionCounts[scored.abstentionReason] += 1;
      continue;
    }
    const logicalKey = computeStreamLogicalKey({
      userId,
      counterpartyKey: group.counterpartyKey,
      transactionType: group.transactionType,
      representativeTokens: group.representativeTokens,
      amountClusterIndex: group.amountClusterIndex,
      normalizerVersion: TRANSACTION_TEXT_NORMALIZER_VERSION
    });
    const memberTransactionIds = scored.members.map((member) => member.transactionId);
    const fingerprint = computeStreamFingerprint({
      logicalKey,
      detectorVersion: RECURRING_DETECTOR_VERSION,
      cadence: scored.cadence.bestCadence,
      state: scored.state,
      medianAmountMinor: scored.amountBehavior.medianMinor,
      madAmountMinor: scored.amountBehavior.madMinor,
      confidenceBps: scored.confidenceBps,
      memberTransactionIds
    });
    streams.push({
      logicalKey,
      fingerprint,
      detectorVersion: RECURRING_DETECTOR_VERSION,
      transactionType: group.transactionType,
      counterpartyKey: group.counterpartyKey,
      cadence: scored.cadence.bestCadence,
      state: scored.state,
      amountBehavior: scored.amountBehavior.behavior,
      confidenceBps: scored.confidenceBps,
      sufficiency: scored.sufficiency,
      evidence: scored.evidence,
      medianAmountMinor: scored.amountBehavior.medianMinor,
      madAmountMinor: scored.amountBehavior.madMinor,
      nextExpectedDate: scored.nextExpectedDate,
      inputWatermark,
      members: scored.members
    });
  }

  const resourceReason = rowBudgetHit ? "resource_limit" : null;
  if (rowBudgetHit) abstentionCounts.resource_limit += 1;
  return buildResult(
    streams,
    rowBudgetHit ? "degraded" : "completed",
    resourceReason,
    bounded.length,
    elapsed(clock, startedAt),
    rowBudgetHit,
    inputWatermark,
    abstentionCounts
  );
}

export function computeInputWatermark(
  transactions: readonly TransactionInput[],
  asOf: Date
): RecurringDetectionInputWatermark {
  const ordered = [...transactions].sort(
    (left, right) =>
      left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id)
  );
  let latestOccurredAt: Date | null = null;
  let latestUpdatedAt: Date | null = null;
  for (const transaction of ordered) {
    if (latestOccurredAt === null || transaction.occurredAt > latestOccurredAt) {
      latestOccurredAt = transaction.occurredAt;
    }
    if (latestUpdatedAt === null || transaction.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = transaction.updatedAt;
    }
  }
  const lastTransactionId = ordered.at(-1)?.id ?? null;
  const digest = sha256([
    asOf.toISOString(),
    ...ordered.map((transaction) =>
      [
        transaction.id,
        transaction.type,
        String(transaction.amountMinor),
        transaction.occurredAt.toISOString(),
        transaction.createdAt.toISOString(),
        transaction.updatedAt.toISOString(),
        transaction.description
      ].join(":")
    )
  ]);
  return {
    asOf,
    latestOccurredAt,
    latestUpdatedAt,
    lastTransactionId,
    rowCount: ordered.length,
    digest
  };
}

function buildResult(
  streams: readonly DetectedStreamOutput[],
  status: "completed" | "degraded",
  reason: "resource_limit" | "timeout" | null,
  rowsScanned: number,
  runtimeMs: number,
  rowBudgetHit: boolean,
  inputWatermark: RecurringDetectionInputWatermark,
  abstentionCounts: Readonly<Record<RecurringDetectionAbstentionReason, number>>
): DetectionResult {
  const resources: AlgorithmResourceUsage = {
    rowsScanned,
    runtimeMs,
    rowBudgetHit,
    timedOut: reason === "timeout",
    outcome: reason === null ? { status: "completed" } : { status: "degraded", reason }
  };
  return {
    summary: {
      detectorVersion: RECURRING_DETECTOR_VERSION,
      status,
      inputWatermark,
      sufficiency: {
        status: "sufficient",
        observationCount: rowsScanned,
        minimumRequired: MINIMUM_OBSERVATIONS
      },
      resources,
      candidateCount: streams.filter((stream) => stream.state === "candidate").length,
      matureCount: streams.filter((stream) => stream.state === "mature").length,
      staleCount: streams.filter((stream) => stream.state === "stale").length,
      abstainedGroupCount: Object.values(abstentionCounts).reduce(
        (total, count) => total + count,
        0
      ),
      abstentionCounts
    },
    streams
  };
}

function resultWithoutStreams(input: {
  readonly status: "abstained";
  readonly reason: "insufficient_history";
  readonly rowsScanned: number;
  readonly runtimeMs: number;
  readonly rowBudgetHit: boolean;
  readonly inputWatermark: RecurringDetectionInputWatermark;
  readonly sufficiency: AlgorithmSufficiency;
  readonly abstentionCounts: Readonly<Record<RecurringDetectionAbstentionReason, number>>;
}): DetectionResult {
  return {
    summary: {
      detectorVersion: RECURRING_DETECTOR_VERSION,
      status: input.status,
      inputWatermark: input.inputWatermark,
      sufficiency: input.sufficiency,
      resources: {
        rowsScanned: input.rowsScanned,
        runtimeMs: input.runtimeMs,
        rowBudgetHit: input.rowBudgetHit,
        timedOut: false,
        outcome: { status: "abstained", reason: input.reason }
      },
      candidateCount: 0,
      matureCount: 0,
      staleCount: 0,
      abstainedGroupCount: Object.values(input.abstentionCounts).reduce(
        (total, count) => total + count,
        0
      ),
      abstentionCounts: input.abstentionCounts
    },
    streams: []
  };
}

function emptyAbstentionCounts(): Record<RecurringDetectionAbstentionReason, number> {
  return {
    insufficient_history: 0,
    ambiguous_cadence: 0,
    irregular_cadence: 0,
    missing_counterparty: 0,
    resource_limit: 0,
    timeout: 0
  };
}

function elapsed(clock: () => number, startedAt: number): number {
  return Math.max(0, Math.round(clock() - startedAt));
}
