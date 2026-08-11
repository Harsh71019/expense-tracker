import { z } from "zod";

import {
  AlgorithmResourceUsageSchema,
  AlgorithmSufficiencySchema,
  RecurrenceDecisionMetricsSchema
} from "./algorithm-evaluation.js";
import { TransactionTypeSchema } from "./transaction.js";

const SafeNonNegativeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const SafePositiveIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const SafePositiveAmountSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const BasisPointsSchema = z.number().int().min(0).max(10_000);
const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const DetectedStreamCadenceSchema = z.enum([
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "quarterly",
  "annual"
]);

export const DetectedStreamStateSchema = z.enum(["candidate", "mature", "stale"]);
export const DetectedStreamAmountBehaviorSchema = z.enum(["fixed", "variable", "unknown"]);
export const RecurringDetectionAbstentionReasonSchema = z.enum([
  "insufficient_history",
  "ambiguous_cadence",
  "irregular_cadence",
  "missing_counterparty",
  "resource_limit",
  "timeout"
]);
export const RecurringDetectionRunStatusSchema = z.enum([
  "running",
  "completed",
  "degraded",
  "abstained",
  "failed"
]);

export const RecurringDetectionInputWatermarkSchema = z
  .object({
    asOf: z.coerce.date(),
    latestOccurredAt: z.coerce.date().nullable(),
    latestUpdatedAt: z.coerce.date().nullable(),
    lastTransactionId: z.string().uuid().nullable(),
    rowCount: SafeNonNegativeIntegerSchema,
    digest: Sha256Schema
  })
  .readonly();

export const DetectedStreamCadenceEvidenceSchema = z
  .object({
    coverageBps: BasisPointsSchema,
    dateStabilityBps: BasisPointsSchema,
    amountStabilityBps: BasisPointsSchema,
    textStabilityBps: BasisPointsSchema,
    missPenaltyBps: BasisPointsSchema,
    cadenceMarginBps: BasisPointsSchema,
    expectedSlotCount: SafeNonNegativeIntegerSchema,
    matchedSlotCount: SafeNonNegativeIntegerSchema,
    recentMissCount: SafeNonNegativeIntegerSchema
  })
  .readonly();

export const DetectedStreamEvidenceSchema = z
  .object({
    cadenceScore: DetectedStreamCadenceEvidenceSchema,
    confidenceBps: BasisPointsSchema,
    medianAmountMinor: SafePositiveAmountSchema,
    madAmountMinor: SafeNonNegativeIntegerSchema,
    intervalMedianDays: SafeNonNegativeIntegerSchema,
    intervalMadDays: SafeNonNegativeIntegerSchema,
    memberCount: SafePositiveIntegerSchema,
    observationSpanDays: SafeNonNegativeIntegerSchema,
    normalizerVersion: SafePositiveIntegerSchema,
    scoringPolicyVersion: SafePositiveIntegerSchema
  })
  .readonly();

export const DetectedRecurringStreamIdSchema = z.string().uuid();

export const DetectedRecurringStreamSchema = z
  .object({
    id: DetectedRecurringStreamIdSchema,
    userId: z.string().min(1),
    logicalKey: Sha256Schema,
    fingerprint: Sha256Schema,
    detectorVersion: SafePositiveIntegerSchema,
    transactionType: TransactionTypeSchema,
    counterpartyKey: z.string().min(1).nullable(),
    cadence: DetectedStreamCadenceSchema,
    state: DetectedStreamStateSchema,
    amountBehavior: DetectedStreamAmountBehaviorSchema,
    confidenceBps: BasisPointsSchema,
    sufficiency: AlgorithmSufficiencySchema,
    evidence: DetectedStreamEvidenceSchema,
    medianAmountMinor: SafePositiveAmountSchema,
    madAmountMinor: SafeNonNegativeIntegerSchema,
    nextExpectedDate: CalendarDateSchema.nullable(),
    inputWatermark: RecurringDetectionInputWatermarkSchema,
    supersedesStreamId: DetectedRecurringStreamIdSchema.nullable(),
    computedAt: z.coerce.date()
  })
  .readonly();

export const DetectedStreamMemberSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().min(1),
    streamId: DetectedRecurringStreamIdSchema,
    transactionId: z.string().uuid(),
    residualDays: z.number().int().min(-366).max(366),
    normalizerVersion: SafePositiveIntegerSchema,
    createdAt: z.coerce.date()
  })
  .readonly();

export const RecurringDetectionRunResultSchema = z
  .object({
    id: z.string().uuid(),
    detectorVersion: SafePositiveIntegerSchema,
    status: RecurringDetectionRunStatusSchema,
    asOf: z.coerce.date(),
    inputWatermark: RecurringDetectionInputWatermarkSchema,
    sufficiency: AlgorithmSufficiencySchema,
    resources: AlgorithmResourceUsageSchema,
    candidateCount: SafeNonNegativeIntegerSchema,
    matureCount: SafeNonNegativeIntegerSchema,
    staleCount: SafeNonNegativeIntegerSchema,
    abstainedGroupCount: SafeNonNegativeIntegerSchema,
    processedStreamCount: SafeNonNegativeIntegerSchema,
    totalStreamCount: SafeNonNegativeIntegerSchema,
    startedAt: z.coerce.date(),
    completedAt: z.coerce.date().nullable()
  })
  .readonly();

export const RecurringDetectionPromotionDecisionSchema = z
  .object({
    detectorVersion: SafePositiveIntegerSchema,
    eligible: z.boolean(),
    completeDecisionWindows: SafeNonNegativeIntegerSchema,
    minimumDecisionWindows: SafePositiveIntegerSchema,
    candidateMetrics: RecurrenceDecisionMetricsSchema,
    baselineMetrics: RecurrenceDecisionMetricsSchema,
    reason: z.enum([
      "improved",
      "insufficient_windows",
      "precision_below_floor",
      "no_measured_improvement"
    ])
  })
  .readonly();

export type DetectedStreamCadence = z.infer<typeof DetectedStreamCadenceSchema>;
export type DetectedStreamState = z.infer<typeof DetectedStreamStateSchema>;
export type DetectedStreamAmountBehavior = z.infer<typeof DetectedStreamAmountBehaviorSchema>;
export type RecurringDetectionAbstentionReason = z.infer<
  typeof RecurringDetectionAbstentionReasonSchema
>;
export type RecurringDetectionRunStatus = z.infer<typeof RecurringDetectionRunStatusSchema>;
export type RecurringDetectionInputWatermark = z.infer<
  typeof RecurringDetectionInputWatermarkSchema
>;
export type DetectedStreamCadenceEvidence = z.infer<typeof DetectedStreamCadenceEvidenceSchema>;
export type DetectedStreamEvidence = z.infer<typeof DetectedStreamEvidenceSchema>;
export type DetectedRecurringStreamId = z.infer<typeof DetectedRecurringStreamIdSchema>;
export type DetectedRecurringStream = z.infer<typeof DetectedRecurringStreamSchema>;
export type DetectedStreamMember = z.infer<typeof DetectedStreamMemberSchema>;
export type RecurringDetectionRunResult = z.infer<typeof RecurringDetectionRunResultSchema>;
export type RecurringDetectionPromotionDecision = z.infer<
  typeof RecurringDetectionPromotionDecisionSchema
>;
