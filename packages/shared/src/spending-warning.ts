import { z } from "zod";

import { CategoryIdSchema } from "./category.js";
import { PageInfoSchema } from "./pagination.js";
import { TransactionIdSchema } from "./transaction.js";

const NonNegativeMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const BasisPointsSchema = z.number().int().min(0);
const CountSchema = z.number().int().min(0);

export const SpendingWarningKindSchema = z.enum([
  "overall_spend_spike",
  "category_spend_spike",
  "unusually_large_expense"
]);

export const SpendingWarningSeveritySchema = z.enum(["attention", "high"]);

export const SpendingWarningStatusSchema = z.enum(["active", "dismissed", "resolved"]);

/**
 * API-facing coverage status. `learning`/`ready` are persisted on
 * `spending_warning_analysis_state.status`; `stale`/`unavailable` are
 * derived at read time from `computedAt` (plan §4.5/§5) and never stored.
 */
export const SpendingWarningAnalysisStatusSchema = z.enum([
  "learning",
  "ready",
  "stale",
  "unavailable"
]);

export const SpendingWarningIdSchema = z.string().uuid("Spending warning id must be a UUID.");

/**
 * Evidence is the only detector payload exposed across the API boundary
 * (plan §6): integer paise, integer basis points, integer counts, window
 * timestamps, category id/name, transaction id. No description, tags,
 * account identifiers, or raw detector internals.
 */
export const OverallSpendSpikeEvidenceSchema = z.object({
  kind: z.literal("overall_spend_spike"),
  currentMinor: NonNegativeMinorSchema,
  baselineMedianMinor: NonNegativeMinorSchema,
  deltaMinor: NonNegativeMinorSchema,
  ratioBasisPoints: BasisPointsSchema,
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
  baselineWindowCount: CountSchema,
  baselineExpenseCount: CountSchema
});

export const CategorySpendSpikeEvidenceSchema = z.object({
  kind: z.literal("category_spend_spike"),
  categoryId: CategoryIdSchema.optional(),
  categoryName: z.string().optional(),
  currentMinor: NonNegativeMinorSchema,
  baselineMedianMinor: NonNegativeMinorSchema,
  deltaMinor: NonNegativeMinorSchema,
  ratioBasisPoints: BasisPointsSchema,
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
  baselineWindowCount: CountSchema,
  baselineExpenseCount: CountSchema,
  currentExpenseCount: CountSchema
});

export const UnusuallyLargeExpenseEvidenceSchema = z.object({
  kind: z.literal("unusually_large_expense"),
  transactionId: TransactionIdSchema,
  categoryId: CategoryIdSchema.optional(),
  categoryName: z.string().optional(),
  amountMinor: NonNegativeMinorSchema,
  thresholdMinor: NonNegativeMinorSchema,
  baselineMedianMinor: NonNegativeMinorSchema,
  baselineQ1Minor: NonNegativeMinorSchema,
  baselineQ3Minor: NonNegativeMinorSchema,
  baselineExpenseCount: CountSchema,
  occurredAt: z.coerce.date()
});

export const SpendingWarningEvidenceSchema = z.discriminatedUnion("kind", [
  OverallSpendSpikeEvidenceSchema,
  CategorySpendSpikeEvidenceSchema,
  UnusuallyLargeExpenseEvidenceSchema
]);

export const SpendingWarningSchema = z.object({
  id: SpendingWarningIdSchema,
  userId: z.string().min(1),
  fingerprint: z.string().min(1),
  kind: SpendingWarningKindSchema,
  severity: SpendingWarningSeveritySchema,
  status: SpendingWarningStatusSchema,
  categoryId: CategoryIdSchema.optional(),
  transactionId: TransactionIdSchema.optional(),
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
  evidence: SpendingWarningEvidenceSchema,
  detectorVersion: z.number().int().positive(),
  firstDetectedAt: z.coerce.date(),
  lastDetectedAt: z.coerce.date(),
  dismissedAt: z.coerce.date().optional(),
  resolvedAt: z.coerce.date().optional()
});

export const SpendingWarningEligibleKindsSchema = z.array(SpendingWarningKindSchema);

export const SpendingWarningAnalysisSchema = z.object({
  status: SpendingWarningAnalysisStatusSchema,
  computedAt: z.coerce.date().optional(),
  sourceThrough: z.coerce.date().optional(),
  historyStart: z.coerce.date().optional(),
  eligibleKinds: SpendingWarningEligibleKindsSchema,
  baselineExpenseCount: CountSchema
});

export const ListSpendingWarningsQuerySchema = z.object({
  kind: SpendingWarningKindSchema.optional(),
  severity: SpendingWarningSeveritySchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export const SpendingWarningPageSchema = z.object({
  items: z.array(SpendingWarningSchema),
  pageInfo: PageInfoSchema,
  analysis: SpendingWarningAnalysisSchema
});

export const DismissSpendingWarningResponseSchema = z.object({
  id: SpendingWarningIdSchema,
  status: z.literal("dismissed"),
  dismissedAt: z.coerce.date()
});

export type SpendingWarningKind = z.infer<typeof SpendingWarningKindSchema>;
export type SpendingWarningSeverity = z.infer<typeof SpendingWarningSeveritySchema>;
export type SpendingWarningStatus = z.infer<typeof SpendingWarningStatusSchema>;
export type SpendingWarningAnalysisStatus = z.infer<typeof SpendingWarningAnalysisStatusSchema>;
export type SpendingWarningId = z.infer<typeof SpendingWarningIdSchema>;
export type OverallSpendSpikeEvidence = z.infer<typeof OverallSpendSpikeEvidenceSchema>;
export type CategorySpendSpikeEvidence = z.infer<typeof CategorySpendSpikeEvidenceSchema>;
export type UnusuallyLargeExpenseEvidence = z.infer<typeof UnusuallyLargeExpenseEvidenceSchema>;
export type SpendingWarningEvidence = z.infer<typeof SpendingWarningEvidenceSchema>;
export type SpendingWarning = z.infer<typeof SpendingWarningSchema>;
export type SpendingWarningAnalysis = z.infer<typeof SpendingWarningAnalysisSchema>;
export type ListSpendingWarningsQuery = z.infer<typeof ListSpendingWarningsQuerySchema>;
export type SpendingWarningPage = z.infer<typeof SpendingWarningPageSchema>;
export type DismissSpendingWarningResponse = z.infer<typeof DismissSpendingWarningResponseSchema>;
