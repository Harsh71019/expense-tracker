import { z } from "zod";

import {
  AlgorithmResourceUsageSchema,
  AlgorithmSufficiencySchema
} from "./algorithm-evaluation.js";

const SafeMinorSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const SafeNonNegativeSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const BasisPointsSchema = z.number().int().min(0).max(10_000);

export const CashflowForecastHorizonSchema = z.union([z.literal(30), z.literal(60), z.literal(90)]);
export const CashflowForecastModelSchema = z.enum([
  "known_cashflow_only",
  "seasonal_naive",
  "trailing_median",
  "ses",
  "croston",
  "sba",
  "tsb"
]);
export const CashflowForecastRangeSchema = z
  .object({
    lowerMinor: SafeMinorSchema,
    upperMinor: SafeMinorSchema,
    observedCoverageBps: BasisPointsSchema.nullable(),
    label: z.literal("historical_range")
  })
  .readonly()
  .superRefine((value, ctx) => {
    if (value.lowerMinor > value.upperMinor)
      ctx.addIssue({
        code: "custom",
        message: "lowerMinor must not exceed upperMinor",
        path: ["lowerMinor"]
      });
  });
export const CashflowForecastAssumptionsSchema = z
  .object({
    liquidBalanceMinor: SafeMinorSchema,
    knownRecurringInflowMinor: SafeNonNegativeSchema,
    knownRecurringOutflowMinor: SafeNonNegativeSchema,
    creditCardBillsDueMinor: SafeNonNegativeSchema,
    excludedCreditCardPurchaseCount: SafeNonNegativeSchema,
    excludedTransferCount: SafeNonNegativeSchema,
    variableSpendExcludedRecurringCount: SafeNonNegativeSchema,
    asOfDeterministic: z.literal(true)
  })
  .readonly();
export const CashflowForecastMetricsSchema = z
  .object({
    evaluatedOriginCount: SafeNonNegativeSchema,
    maeMinor: SafeNonNegativeSchema.nullable(),
    maseBps: SafeNonNegativeSchema.nullable(),
    baselineMaeMinor: SafeNonNegativeSchema.nullable(),
    residualCount: SafeNonNegativeSchema,
    observedCoverageBps: BasisPointsSchema.nullable(),
    eligibleForHorizon: z.boolean()
  })
  .readonly();
export const CashflowForecastInputWatermarkSchema = z
  .object({
    asOf: z.coerce.date(),
    latestOccurredAt: z.coerce.date().nullable(),
    latestUpdatedAt: z.coerce.date().nullable(),
    rowCount: SafeNonNegativeSchema,
    digest: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .readonly();
export const CashflowForecastShortfallSchema = z
  .object({
    hasPotentialShortfall: z.boolean(),
    firstPotentialShortfallDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    conservativeBalanceMinor: SafeMinorSchema,
    mode: z.literal("read_only")
  })
  .readonly();
export const CashflowForecastSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    asOf: z.coerce.date(),
    horizonDays: CashflowForecastHorizonSchema,
    modelVersion: z.number().int().positive(),
    inputWatermark: CashflowForecastInputWatermarkSchema,
    sufficiency: AlgorithmSufficiencySchema,
    resources: AlgorithmResourceUsageSchema,
    model: CashflowForecastModelSchema,
    pointBalanceMinor: SafeMinorSchema,
    range: CashflowForecastRangeSchema,
    assumptions: CashflowForecastAssumptionsSchema,
    metrics: CashflowForecastMetricsSchema,
    shortfall: CashflowForecastShortfallSchema,
    computedAt: z.coerce.date()
  })
  .readonly();
export const CashflowForecastQuerySchema = z.object({
  days: CashflowForecastHorizonSchema.default(30)
});

export type CashflowForecastSnapshot = z.infer<typeof CashflowForecastSnapshotSchema>;
export type CashflowForecastQuery = z.infer<typeof CashflowForecastQuerySchema>;
