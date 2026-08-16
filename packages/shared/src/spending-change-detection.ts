import { z } from "zod";

import {
  AlgorithmResourceUsageSchema,
  AlgorithmSufficiencySchema,
  BinaryDecisionMetricsSchema
} from "./algorithm-evaluation.js";

const SafeNonNegativeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const SafePositiveIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const SafePositiveAmountSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const BasisPointsSchema = z.number().int().min(0).max(10_000);
const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const SpendingChangeDirectionSchema = z.enum(["increase", "decrease"]);
export type SpendingChangeDirection = z.infer<typeof SpendingChangeDirectionSchema>;

export const SpendingRegimeTypeSchema = z.enum(["variable_spending"]);
export type SpendingRegimeType = z.infer<typeof SpendingRegimeTypeSchema>;

export const SpendingChangeAbstentionReasonSchema = z.enum([
  "insufficient_history",
  "sparse_history",
  "unstable_baseline",
  "ambiguous_change",
  "resource_limit",
  "timeout"
]);
export type SpendingChangeAbstentionReason = z.infer<typeof SpendingChangeAbstentionReasonSchema>;

export const SpendingChangeRunStatusSchema = z.enum([
  "running",
  "completed",
  "degraded",
  "abstained",
  "failed"
]);
export type SpendingChangeRunStatus = z.infer<typeof SpendingChangeRunStatusSchema>;

export const SpendingChangeInputWatermarkSchema = z
  .object({
    asOf: z.coerce.date(),
    latestOccurredAt: z.coerce.date().nullable(),
    latestUpdatedAt: z.coerce.date().nullable(),
    lastTransactionId: z.string().uuid().nullable(),
    rowCount: SafeNonNegativeIntegerSchema,
    digest: Sha256Schema
  })
  .readonly();
export type SpendingChangeInputWatermark = z.infer<typeof SpendingChangeInputWatermarkSchema>;

export const CusumPointEvidenceSchema = z
  .object({
    index: SafeNonNegativeIntegerSchema,
    amountMinor: SafePositiveAmountSchema,
    deviationMinor: z.number().int(),
    upperMinor: SafeNonNegativeIntegerSchema,
    lowerMinor: SafeNonNegativeIntegerSchema,
    upperTriggered: z.boolean(),
    lowerTriggered: z.boolean()
  })
  .readonly();
export type CusumPointEvidence = z.infer<typeof CusumPointEvidenceSchema>;

export const RecurringAmountChangeEvidenceSchema = z
  .object({
    baselineMedianMinor: SafePositiveAmountSchema,
    baselineMadMinor: SafeNonNegativeIntegerSchema,
    newMedianMinor: SafePositiveAmountSchema,
    newMadMinor: SafeNonNegativeIntegerSchema,
    deltaMinor: SafePositiveAmountSchema,
    deltaBps: BasisPointsSchema,
    direction: SpendingChangeDirectionSchema,
    confidenceBps: BasisPointsSchema,
    preShiftCount: SafePositiveIntegerSchema,
    postShiftCount: SafePositiveIntegerSchema,
    persistenceCount: SafePositiveIntegerSchema,
    changeOccurredAt: z.coerce.date(),
    changeTransactionId: z.string().uuid(),
    referenceAllowanceMinor: SafeNonNegativeIntegerSchema,
    decisionThresholdMinor: SafePositiveAmountSchema,
    cusumStates: z.array(CusumPointEvidenceSchema).readonly(),
    detectorVersion: SafePositiveIntegerSchema
  })
  .readonly();
export type RecurringAmountChangeEvidence = z.infer<typeof RecurringAmountChangeEvidenceSchema>;

export const DetectedRecurringStreamChangeSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().min(1),
    streamId: z.string().uuid(),
    supersedesStreamId: z.string().uuid().nullable(),
    oldMedianMinor: SafePositiveAmountSchema,
    newMedianMinor: SafePositiveAmountSchema,
    deltaMinor: SafePositiveAmountSchema,
    direction: SpendingChangeDirectionSchema,
    confidenceBps: BasisPointsSchema,
    changeOccurredAt: z.coerce.date(),
    changeTransactionId: z.string().uuid(),
    evidence: RecurringAmountChangeEvidenceSchema,
    inputWatermark: SpendingChangeInputWatermarkSchema,
    detectorVersion: SafePositiveIntegerSchema,
    computedAt: z.coerce.date()
  })
  .readonly();
export type DetectedRecurringStreamChange = z.infer<typeof DetectedRecurringStreamChangeSchema>;

export const SpendingRegimeEvidenceSchema = z
  .object({
    baselineMedianMinor: SafePositiveAmountSchema,
    baselineMadMinor: SafeNonNegativeIntegerSchema,
    newMedianMinor: SafePositiveAmountSchema,
    newMadMinor: SafeNonNegativeIntegerSchema,
    deltaMinor: SafePositiveAmountSchema,
    deltaBps: BasisPointsSchema,
    direction: SpendingChangeDirectionSchema,
    confidenceBps: BasisPointsSchema,
    baselinePeriods: SafePositiveIntegerSchema,
    postShiftPeriods: SafePositiveIntegerSchema,
    persistencePeriods: SafePositiveIntegerSchema,
    referenceAllowanceMinor: SafeNonNegativeIntegerSchema,
    decisionThresholdMinor: SafePositiveAmountSchema,
    periodUnit: z.enum(["weekly", "monthly"]),
    cusumStates: z.array(CusumPointEvidenceSchema).readonly(),
    detectorVersion: SafePositiveIntegerSchema
  })
  .readonly();
export type SpendingRegimeEvidence = z.infer<typeof SpendingRegimeEvidenceSchema>;

export const SpendingRegimeSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().min(1),
    regimeType: SpendingRegimeTypeSchema,
    baselineMedianMinor: SafePositiveAmountSchema,
    newMedianMinor: SafePositiveAmountSchema,
    deltaMinor: SafePositiveAmountSchema,
    direction: SpendingChangeDirectionSchema,
    confidenceBps: BasisPointsSchema,
    sufficiency: AlgorithmSufficiencySchema,
    changeDate: CalendarDateSchema,
    occurredAtStart: z.coerce.date(),
    occurredAtEnd: z.coerce.date(),
    evidence: SpendingRegimeEvidenceSchema,
    inputWatermark: SpendingChangeInputWatermarkSchema,
    supersedesRegimeId: z.string().uuid().nullable(),
    detectorVersion: SafePositiveIntegerSchema,
    computedAt: z.coerce.date()
  })
  .readonly();
export type SpendingRegime = z.infer<typeof SpendingRegimeSchema>;

export const SpendingChangeDetectionRunResultSchema = z
  .object({
    id: z.string().uuid(),
    detectorVersion: SafePositiveIntegerSchema,
    status: SpendingChangeRunStatusSchema,
    asOf: z.coerce.date(),
    inputWatermark: SpendingChangeInputWatermarkSchema,
    sufficiency: AlgorithmSufficiencySchema,
    resources: AlgorithmResourceUsageSchema,
    recurringChangesCount: SafeNonNegativeIntegerSchema,
    regimesCount: SafeNonNegativeIntegerSchema,
    abstainedCount: SafeNonNegativeIntegerSchema,
    startedAt: z.coerce.date(),
    completedAt: z.coerce.date().nullable()
  })
  .readonly();
export type SpendingChangeDetectionRunResult = z.infer<
  typeof SpendingChangeDetectionRunResultSchema
>;

export const SpendingChangeDecisionMetricsSchema = z
  .object({
    changeDecision: BinaryDecisionMetricsSchema,
    meanLagDays: SafeNonNegativeIntegerSchema.nullable(),
    meanMagnitudeErrorMinor: SafeNonNegativeIntegerSchema.nullable(),
    falseChangePointRateBps: BasisPointsSchema.nullable()
  })
  .readonly();
export type SpendingChangeDecisionMetrics = z.infer<typeof SpendingChangeDecisionMetricsSchema>;

export const SpendingChangePromotionDecisionSchema = z
  .object({
    activeVersion: SafePositiveIntegerSchema,
    candidateVersion: SafePositiveIntegerSchema,
    eligible: z.boolean(),
    reasons: z.array(z.string()).readonly(),
    metrics: SpendingChangeDecisionMetricsSchema
  })
  .readonly();
export type SpendingChangePromotionDecision = z.infer<typeof SpendingChangePromotionDecisionSchema>;
