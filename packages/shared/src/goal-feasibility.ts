import { z } from "zod";

import { CashflowForecastModelSchema } from "./cashflow-forecast.js";
import { GoalIdSchema } from "./goal.js";
import { SafetyBufferModeSchema } from "./safety-buffer.js";

const NonNegativeMinorSchema = z
  .number()
  .int("Money must be an integer number of paise.")
  .min(0, "Money cannot be negative.")
  .max(Number.MAX_SAFE_INTEGER, "Money exceeds the supported paise range.");

const SignedMinorSchema = z
  .number()
  .int("Money must be an integer number of paise.")
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export const GoalFeasibilityStatusSchema = z.enum([
  "feasible",
  "delayed",
  "at_risk",
  "overdue",
  "achieved",
  "indeterminate"
]);

export const GoalScenarioTypeSchema = z.enum([
  "priority_order",
  "target_date_order",
  "proportional"
]);

export const ProjectedCompletionRangeSchema = z.object({
  optimisticDate: z.coerce.date().nullable(),
  baselineDate: z.coerce.date().nullable(),
  pessimisticDate: z.coerce.date().nullable()
});

export const GoalScenarioAllocationSchema = z.object({
  goalId: GoalIdSchema,
  goalName: z.string(),
  priority: z.number().int().min(0),
  targetDate: z.coerce.date().nullable(),
  targetMinor: NonNegativeMinorSchema,
  progressMinor: SignedMinorSchema,
  remainingMinor: NonNegativeMinorSchema,
  requiredMonthlyMinor: NonNegativeMinorSchema.nullable(),
  allocatedMonthlyMinor: NonNegativeMinorSchema,
  monthlyFundingGapMinor: NonNegativeMinorSchema,
  monthlyFundingSurplusMinor: NonNegativeMinorSchema,
  status: GoalFeasibilityStatusSchema,
  projectedRange: ProjectedCompletionRangeSchema,
  explainability: z.string()
});

export const GoalFeasibilityScenarioSchema = z.object({
  scenarioType: GoalScenarioTypeSchema,
  name: z.string(),
  description: z.string(),
  allocations: z.array(GoalScenarioAllocationSchema),
  totalAllocatedMonthlyMinor: NonNegativeMinorSchema,
  unallocatedSurplusMinor: NonNegativeMinorSchema
});

export const GoalFeasibilityReportSchema = z.object({
  asOf: z.coerce.date(),
  forecastSnapshotId: z.string().uuid().nullable(),
  forecastModel: CashflowForecastModelSchema.nullable(),
  forecastComputedAt: z.coerce.date().nullable(),
  isForecastStale: z.boolean(),
  isForecastSufficient: z.boolean(),
  safetyBufferVersion: z.number().int().positive().nullable(),
  safetyBufferMode: SafetyBufferModeSchema,
  safetyBufferTargetMinor: NonNegativeMinorSchema,
  liquidBalanceMinor: SignedMinorSchema,
  liquidBufferGapMinor: NonNegativeMinorSchema,
  conservativeAvailableMonthlyMinor: NonNegativeMinorSchema,
  totalRequiredMonthlyMinor: NonNegativeMinorSchema,
  monthlySurplusMinor: SignedMinorSchema,
  scenarios: z.array(GoalFeasibilityScenarioSchema),
  assumptions: z.record(z.string(), z.unknown())
});

export const GoalFeasibilityQuerySchema = z.object({
  asOf: z.coerce.date().optional()
});

export type GoalFeasibilityStatus = z.infer<typeof GoalFeasibilityStatusSchema>;
export type GoalScenarioType = z.infer<typeof GoalScenarioTypeSchema>;
export type ProjectedCompletionRange = z.infer<typeof ProjectedCompletionRangeSchema>;
export type GoalScenarioAllocation = z.infer<typeof GoalScenarioAllocationSchema>;
export type GoalFeasibilityScenario = z.infer<typeof GoalFeasibilityScenarioSchema>;
export type GoalFeasibilityReport = z.infer<typeof GoalFeasibilityReportSchema>;
export type GoalFeasibilityQuery = z.infer<typeof GoalFeasibilityQuerySchema>;
