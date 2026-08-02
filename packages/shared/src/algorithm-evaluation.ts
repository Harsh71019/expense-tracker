import { z } from "zod";

const SafeNonNegativeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const SafePositiveIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const BasisPointsSchema = z.number().int().min(0).max(10_000);

export const AlgorithmVersionSchema = z.number().int().positive();

export const AlgorithmRolloutModeSchema = z.enum(["shadow", "canary", "active"]);

export const AlgorithmAbstentionReasonSchema = z.enum([
  "insufficient_history",
  "ambiguous",
  "resource_limit",
  "timeout",
  "unsupported_series"
]);

export const AlgorithmSufficiencySchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("sufficient"),
      observationCount: SafeNonNegativeIntegerSchema,
      minimumRequired: SafePositiveIntegerSchema
    })
    .readonly()
    .superRefine((sufficiency, context) => {
      if (sufficiency.observationCount < sufficiency.minimumRequired) {
        context.addIssue({
          code: "custom",
          message: "sufficient history must meet minimumRequired.",
          path: ["observationCount"]
        });
      }
    }),
  z
    .object({
      status: z.literal("insufficient"),
      reason: AlgorithmAbstentionReasonSchema,
      observationCount: SafeNonNegativeIntegerSchema,
      minimumRequired: SafePositiveIntegerSchema
    })
    .readonly()
]);

export const AlgorithmRunOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("completed") }).readonly(),
  z
    .object({
      status: z.literal("degraded"),
      reason: AlgorithmAbstentionReasonSchema
    })
    .readonly(),
  z
    .object({
      status: z.literal("abstained"),
      reason: AlgorithmAbstentionReasonSchema
    })
    .readonly()
]);

export const AlgorithmComplexitySchema = z.enum(["linear", "n_log_n", "bounded_quadratic"]);

export const AlgorithmDegradedModeSchema = z.enum([
  "paginate_resume",
  "return_resource_limit",
  "abstain"
]);

/**
 * A worker's declared resource ceiling. The 200-row batch cap mirrors the
 * repository-wide transaction rule even though evaluation itself is read-only.
 */
export const AlgorithmResourceContractSchema = z
  .object({
    lookbackDays: z.number().int().min(1).max(3_660),
    maxRows: z.number().int().min(1).max(50_000),
    batchSize: z.number().int().min(1).max(200),
    expectedComplexity: AlgorithmComplexitySchema,
    timeoutMs: z.number().int().min(1).max(3_600_000),
    degradedMode: AlgorithmDegradedModeSchema
  })
  .readonly();

export const AlgorithmResourceUsageSchema = z
  .object({
    rowsScanned: SafeNonNegativeIntegerSchema,
    runtimeMs: SafeNonNegativeIntegerSchema,
    rowBudgetHit: z.boolean(),
    timedOut: z.boolean(),
    outcome: AlgorithmRunOutcomeSchema
  })
  .readonly();

export const AlgorithmRunContextSchema = z
  .object({
    algorithmKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
    algorithmVersion: AlgorithmVersionSchema,
    policyVersion: AlgorithmVersionSchema,
    rolloutMode: AlgorithmRolloutModeSchema,
    inputWatermark: z.string().min(1),
    sufficiency: AlgorithmSufficiencySchema,
    resources: AlgorithmResourceUsageSchema
  })
  .readonly();

export const AlgorithmMetricUnitSchema = z.enum([
  "basis_points",
  "minor",
  "count",
  "days",
  "milliseconds"
]);

export const AlgorithmMetricDeltaSchema = z
  .object({
    metric: z.string().regex(/^[a-z][a-z0-9_]*$/),
    unit: AlgorithmMetricUnitSchema,
    activeValue: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    candidateValue: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    delta: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
  })
  .readonly()
  .superRefine((metric, context) => {
    if (BigInt(metric.candidateValue) - BigInt(metric.activeValue) !== BigInt(metric.delta)) {
      context.addIssue({
        code: "custom",
        message: "delta must equal candidateValue minus activeValue.",
        path: ["delta"]
      });
    }
  });

/** Aggregate-only comparison data; user identifiers and raw inputs have no fields here. */
export const AlgorithmVersionComparisonSchema = z
  .object({
    algorithmKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
    rolloutMode: z.enum(["shadow", "canary"]),
    activeVersion: AlgorithmVersionSchema,
    candidateVersion: AlgorithmVersionSchema,
    completeDecisionWindows: SafePositiveIntegerSchema,
    metrics: z.array(AlgorithmMetricDeltaSchema).min(1).readonly()
  })
  .readonly();

export const BinaryDecisionMetricsSchema = z
  .object({
    observationCount: SafeNonNegativeIntegerSchema,
    truePositiveCount: SafeNonNegativeIntegerSchema,
    falsePositiveCount: SafeNonNegativeIntegerSchema,
    falseNegativeCount: SafeNonNegativeIntegerSchema,
    trueNegativeCount: SafeNonNegativeIntegerSchema,
    precisionBps: BasisPointsSchema.nullable(),
    recallBps: BasisPointsSchema.nullable()
  })
  .readonly()
  .superRefine((metrics, context) => {
    const classifiedCount =
      metrics.truePositiveCount +
      metrics.falsePositiveCount +
      metrics.falseNegativeCount +
      metrics.trueNegativeCount;
    if (classifiedCount !== metrics.observationCount) {
      context.addIssue({
        code: "custom",
        message: "binary decision counts must sum to observationCount.",
        path: ["observationCount"]
      });
    }
  });

export const CategoryDecisionMetricsSchema = z
  .object({
    eligibleCount: SafeNonNegativeIntegerSchema,
    predictedCount: SafeNonNegativeIntegerSchema,
    correctCount: SafeNonNegativeIntegerSchema,
    top1PrecisionBps: BasisPointsSchema.nullable(),
    coverageBps: BasisPointsSchema,
    amountWeightedAccuracyBps: BasisPointsSchema.nullable()
  })
  .readonly()
  .superRefine((metrics, context) => {
    if (metrics.predictedCount > metrics.eligibleCount) {
      context.addIssue({
        code: "custom",
        message: "predictedCount must not exceed eligibleCount.",
        path: ["predictedCount"]
      });
    }
    if (metrics.correctCount > metrics.predictedCount) {
      context.addIssue({
        code: "custom",
        message: "correctCount must not exceed predictedCount.",
        path: ["correctCount"]
      });
    }
  });

export const ForecastDecisionMetricsSchema = z
  .object({
    observationCount: SafeNonNegativeIntegerSchema,
    maeMinor: SafeNonNegativeIntegerSchema.nullable(),
    baselineMaeMinor: SafeNonNegativeIntegerSchema.nullable(),
    maseBps: SafeNonNegativeIntegerSchema.nullable(),
    eventOccurrence: BinaryDecisionMetricsSchema,
    intervalCoverageBps: BasisPointsSchema.nullable(),
    meanIntervalWidthMinor: SafeNonNegativeIntegerSchema.nullable()
  })
  .readonly()
  .superRefine((metrics, context) => {
    if (metrics.eventOccurrence.observationCount !== metrics.observationCount) {
      context.addIssue({
        code: "custom",
        message: "eventOccurrence must cover every forecast observation.",
        path: ["eventOccurrence", "observationCount"]
      });
    }
  });

export const RecurrenceDecisionMetricsSchema = z
  .object({
    matureStreamDecision: BinaryDecisionMetricsSchema,
    nextDateMaeDays: SafeNonNegativeIntegerSchema.nullable(),
    nextAmountMaeMinor: SafeNonNegativeIntegerSchema.nullable(),
    missedPaymentMeanLeadDays: SafeNonNegativeIntegerSchema.nullable(),
    acceptedCount: SafeNonNegativeIntegerSchema,
    rejectedCount: SafeNonNegativeIntegerSchema,
    unreviewedCount: SafeNonNegativeIntegerSchema,
    acceptanceRateBps: BasisPointsSchema.nullable(),
    rejectionRateBps: BasisPointsSchema.nullable()
  })
  .readonly()
  .superRefine((metrics, context) => {
    const reviewCount = metrics.acceptedCount + metrics.rejectedCount + metrics.unreviewedCount;
    if (reviewCount !== metrics.matureStreamDecision.observationCount) {
      context.addIssue({
        code: "custom",
        message: "recurrence review counts must cover every observation.",
        path: ["acceptedCount"]
      });
    }
  });

export const ShortfallDecisionMetricsSchema = z
  .object({
    shortfallDecision: BinaryDecisionMetricsSchema,
    meanWarningLeadDays: SafeNonNegativeIntegerSchema.nullable(),
    firstShortfallDateMaeDays: SafeNonNegativeIntegerSchema.nullable()
  })
  .readonly();

export const BudgetDecisionMetricsSchema = z
  .object({
    breachDecision: BinaryDecisionMetricsSchema,
    meanWarningLeadDays: SafeNonNegativeIntegerSchema.nullable(),
    postBreachWarningCount: SafeNonNegativeIntegerSchema
  })
  .readonly();

export const WarningDecisionMetricsSchema = z
  .object({
    warningCount: SafeNonNegativeIntegerSchema,
    confirmedCount: SafeNonNegativeIntegerSchema,
    dismissedCount: SafeNonNegativeIntegerSchema,
    unresolvedCount: SafeNonNegativeIntegerSchema,
    confirmedUsefulnessBps: BasisPointsSchema.nullable(),
    dismissRateBps: BasisPointsSchema.nullable(),
    totalAmountAtRiskMinor: SafeNonNegativeIntegerSchema
  })
  .readonly()
  .superRefine((metrics, context) => {
    if (
      metrics.confirmedCount + metrics.dismissedCount + metrics.unresolvedCount !==
      metrics.warningCount
    ) {
      context.addIssue({
        code: "custom",
        message: "warning outcome counts must sum to warningCount.",
        path: ["warningCount"]
      });
    }
  });

export type AlgorithmVersion = z.infer<typeof AlgorithmVersionSchema>;
export type AlgorithmRolloutMode = z.infer<typeof AlgorithmRolloutModeSchema>;
export type AlgorithmAbstentionReason = z.infer<typeof AlgorithmAbstentionReasonSchema>;
export type AlgorithmSufficiency = z.infer<typeof AlgorithmSufficiencySchema>;
export type AlgorithmRunOutcome = z.infer<typeof AlgorithmRunOutcomeSchema>;
export type AlgorithmComplexity = z.infer<typeof AlgorithmComplexitySchema>;
export type AlgorithmDegradedMode = z.infer<typeof AlgorithmDegradedModeSchema>;
export type AlgorithmResourceContract = z.infer<typeof AlgorithmResourceContractSchema>;
export type AlgorithmResourceUsage = z.infer<typeof AlgorithmResourceUsageSchema>;
export type AlgorithmRunContext = z.infer<typeof AlgorithmRunContextSchema>;
export type AlgorithmMetricUnit = z.infer<typeof AlgorithmMetricUnitSchema>;
export type AlgorithmMetricDelta = z.infer<typeof AlgorithmMetricDeltaSchema>;
export type AlgorithmVersionComparison = z.infer<typeof AlgorithmVersionComparisonSchema>;
export type BinaryDecisionMetrics = z.infer<typeof BinaryDecisionMetricsSchema>;
export type CategoryDecisionMetrics = z.infer<typeof CategoryDecisionMetricsSchema>;
export type ForecastDecisionMetrics = z.infer<typeof ForecastDecisionMetricsSchema>;
export type RecurrenceDecisionMetrics = z.infer<typeof RecurrenceDecisionMetricsSchema>;
export type ShortfallDecisionMetrics = z.infer<typeof ShortfallDecisionMetricsSchema>;
export type BudgetDecisionMetrics = z.infer<typeof BudgetDecisionMetricsSchema>;
export type WarningDecisionMetrics = z.infer<typeof WarningDecisionMetricsSchema>;
