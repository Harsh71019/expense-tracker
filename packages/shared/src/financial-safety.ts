import { z } from "zod";
import { AccountTypeSchema } from "./account.js";
import { AssetKindSchema } from "./asset.js";
import { FinancialAttentionLevelSchema } from "./financial-diagnostic.js";
import { ProtectionCoverageStateSchema } from "./financial-protection.js";
import { PageInfoSchema } from "./pagination.js";
import { MonthSchema } from "./report.js";

export const ESSENTIAL_BURN_FORMULA_VERSION = 1;
export const ESSENTIAL_BURN_REQUIRED_MONTHS = 3;
export const ESSENTIAL_BURN_TIMEZONE = "Asia/Kolkata" as const;

export const EssentialBurnQualitySchema = z.enum(["unavailable", "limited", "complete"]);

export const EssentialBurnObservationStatusSchema = z.enum(["observed", "missing_history"]);

export const EssentialBurnLimitationKeySchema = z.enum([
  "current_category_metadata_in_use",
  "uncategorized_expenses_present",
  "ungrouped_categories_present",
  "insufficient_history",
  "no_history",
  "partial_month_excluded"
]);

export const EssentialBurnClassificationSchema = z.object({
  eligibleExpenseTransactionCount: z.number().int().min(0),
  essentialExpenseTransactionCount: z.number().int().min(0),
  lifestyleExpenseTransactionCount: z.number().int().min(0),
  uncategorizedExpenseCount: z.number().int().min(0),
  uncategorizedExpenseMinor: z.number().int().min(0),
  ungroupedExpenseCount: z.number().int().min(0),
  ungroupedExpenseMinor: z.number().int().min(0),
  categorizedExpenseMinor: z.number().int().min(0),
  unclassifiedExpenseMinor: z.number().int().min(0),
  coverageRatioBps: z.number().int().min(0).max(10000).nullable(),
  currentCategoryMetadataInUse: z.boolean()
});

export const EssentialBurnMonthSchema = z.object({
  month: MonthSchema,
  observation: EssentialBurnObservationStatusSchema,
  essentialTotalMinor: z.number().int().min(0),
  eligibleExpenseTransactionCount: z.number().int().min(0),
  essentialTransactionCount: z.number().int().min(0)
});

export const EssentialBurnCurrentMonthSchema = z.object({
  month: MonthSchema,
  essentialTotalMinor: z.number().int().min(0),
  eligibleExpenseTransactionCount: z.number().int().min(0),
  essentialTransactionCount: z.number().int().min(0),
  excludedFromBaseline: z.literal(true)
});

export const EssentialBurnResponseSchema = z.object({
  computedAt: z.coerce.date(),
  asOf: z.coerce.date(),
  sourceThrough: z.coerce.date(),
  formulaVersion: z.number().int().min(1),
  timezone: z.literal(ESSENTIAL_BURN_TIMEZONE),
  requiredCompleteMonths: z.literal(ESSENTIAL_BURN_REQUIRED_MONTHS),
  observedCompleteMonthCount: z.number().int().min(0).max(3),
  averageMonthlyEssentialMinor: z.number().int().min(0).nullable(),
  quality: EssentialBurnQualitySchema,
  completeMonths: z.array(EssentialBurnMonthSchema).length(3),
  currentPartialMonth: EssentialBurnCurrentMonthSchema,
  classification: EssentialBurnClassificationSchema,
  limitations: z.array(EssentialBurnLimitationKeySchema)
});

export const EssentialBurnQuerySchema = z.object({
  asOf: z.coerce.date().optional()
});

export type EssentialBurnQuality = z.infer<typeof EssentialBurnQualitySchema>;
export type EssentialBurnObservationStatus = z.infer<typeof EssentialBurnObservationStatusSchema>;
export type EssentialBurnLimitationKey = z.infer<typeof EssentialBurnLimitationKeySchema>;
export type EssentialBurnClassification = z.infer<typeof EssentialBurnClassificationSchema>;
export type EssentialBurnMonth = z.infer<typeof EssentialBurnMonthSchema>;
export type EssentialBurnCurrentMonth = z.infer<typeof EssentialBurnCurrentMonthSchema>;
export type EssentialBurnResponse = z.infer<typeof EssentialBurnResponseSchema>;
export type EssentialBurnQuery = z.infer<typeof EssentialBurnQuerySchema>;

// ---------------------------------------------------------------------------
// Emergency Reserve Sources
// ---------------------------------------------------------------------------
//
// Reserve classification is planning metadata only: it stores a liquidity
// tier and an optional eligible cap against an existing account or asset. It
// never stores an independent copy of a balance or valuation. The canonical
// value always comes from the account's current `balanceMinor` or the
// asset's latest non-stale valuation at evaluation time -- see
// docs/features/02-safety-ladder-runway/02-emergency-reserve-sources/backend.md.

export const RESERVE_FORMULA_VERSION = 1;
export const RESERVE_POLICY_VERSION = 1;
export const RESERVE_TIMEZONE = "Asia/Kolkata" as const;

const SafePositiveMinorSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER, "Amount exceeds the supported paise range.");

const SafeNonNegativeMinorSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER, "Amount exceeds the supported paise range.");

const SafeSignedMinorSchema = z
  .number()
  .int()
  .min(-Number.MAX_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER, "Amount exceeds the supported paise range.");

export const ReserveSourceKindSchema = z.enum(["account", "asset"]);

export const ReserveLiquidityTierSchema = z.enum(["instant", "t_plus_1", "locked"]);

export const ReserveSourceEligibilitySchema = z.enum(["eligible", "ineligible"]);

export const ReserveSourceExclusionReasonSchema = z.enum([
  "none",
  "not_configured",
  "user_excluded",
  "locked",
  "unsupported_account_type",
  "unsupported_asset_kind",
  "archived_account",
  "closed_asset",
  "missing_valuation",
  "stale_valuation",
  "non_positive_value",
  "cap_results_in_zero",
  "potential_double_count"
]);

export const ReserveValueFreshnessSchema = z.enum(["fresh", "stale", "missing", "not_applicable"]);

export const ReserveSourceIdSchema = z.string().uuid("Source id must be a UUID.");

/** The stored classification metadata for one source -- planning only, never a balance copy. */
export const ReserveSourceConfigurationSchema = z.object({
  liquidityTier: ReserveLiquidityTierSchema,
  isIncluded: z.boolean(),
  eligibleCapMinor: SafePositiveMinorSchema.nullable(),
  effectiveFrom: z.coerce.date(),
  configuredAt: z.coerce.date()
});

export const UpdateReserveSourceSchema = z.object({
  liquidityTier: ReserveLiquidityTierSchema,
  isIncluded: z.boolean(),
  eligibleCapMinor: SafePositiveMinorSchema.optional(),
  effectiveFrom: z.coerce.date().optional()
});

export const ReserveSourceTypeSchema = z.union([AccountTypeSchema, AssetKindSchema]);

/** One candidate row: an existing account or asset, its configuration (if any), and its evaluated eligibility. */
export const ReserveSourceSchema = z.object({
  sourceKind: ReserveSourceKindSchema,
  sourceId: ReserveSourceIdSchema,
  displayName: z.string().min(1),
  sourceType: ReserveSourceTypeSchema,
  configuration: ReserveSourceConfigurationSchema.nullable(),
  currentValueMinor: SafeSignedMinorSchema.nullable(),
  valuedAt: z.coerce.date().nullable(),
  freshness: ReserveValueFreshnessSchema,
  eligibleMinor: SafeNonNegativeMinorSchema,
  eligibility: ReserveSourceEligibilitySchema,
  exclusionReason: ReserveSourceExclusionReasonSchema,
  isUnavailable: z.boolean(),
  lastUpdatedAt: z.coerce.date().nullable()
});

export const ReserveSourcePageSchema = z.object({
  items: z.array(ReserveSourceSchema),
  pageInfo: PageInfoSchema
});

export const ListReserveSourcesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sourceKind: ReserveSourceKindSchema.optional(),
  configured: z.coerce.boolean().optional(),
  eligible: z.coerce.boolean().optional()
});

export const ReserveSummaryQuerySchema = z.object({
  asOf: z.coerce.date().optional()
});

export const ReserveLimitationKeySchema = z.enum([
  "no_candidates_available",
  "no_sources_configured",
  "configured_but_none_eligible",
  "missing_valuations_present",
  "stale_valuations_present",
  "locked_sources_present",
  "archived_or_closed_sources_present"
]);

export const ReserveSummarySchema = z.object({
  computedAt: z.coerce.date(),
  asOf: z.coerce.date(),
  sourceThrough: z.coerce.date(),
  formulaVersion: z.number().int().min(1),
  policyVersion: z.number().int().min(1),
  timezone: z.literal(RESERVE_TIMEZONE),
  configuredSourceCount: z.number().int().min(0),
  currentlyEligibleSourceCount: z.number().int().min(0),
  instantMinor: SafeNonNegativeMinorSchema,
  tPlusOneMinor: SafeNonNegativeMinorSchema,
  totalEligibleMinor: SafeNonNegativeMinorSchema,
  lockedMinor: SafeNonNegativeMinorSchema,
  staleExcludedMinor: SafeNonNegativeMinorSchema,
  missingValueSourceCount: z.number().int().min(0),
  staleSourceCount: z.number().int().min(0),
  excludedSourceCount: z.number().int().min(0),
  limitations: z.array(ReserveLimitationKeySchema)
});

export type ReserveSourceKind = z.infer<typeof ReserveSourceKindSchema>;
export type ReserveLiquidityTier = z.infer<typeof ReserveLiquidityTierSchema>;
export type ReserveSourceEligibility = z.infer<typeof ReserveSourceEligibilitySchema>;
export type ReserveSourceExclusionReason = z.infer<typeof ReserveSourceExclusionReasonSchema>;
export type ReserveValueFreshness = z.infer<typeof ReserveValueFreshnessSchema>;
export type ReserveSourceId = z.infer<typeof ReserveSourceIdSchema>;
export type ReserveSourceConfiguration = z.infer<typeof ReserveSourceConfigurationSchema>;
export type UpdateReserveSource = z.infer<typeof UpdateReserveSourceSchema>;
export type ReserveSourceType = z.infer<typeof ReserveSourceTypeSchema>;
export type ReserveSource = z.infer<typeof ReserveSourceSchema>;
export type ReserveSourcePage = z.infer<typeof ReserveSourcePageSchema>;
export type ListReserveSourcesQuery = z.infer<typeof ListReserveSourcesQuerySchema>;
export type ReserveSummaryQuery = z.infer<typeof ReserveSummaryQuerySchema>;
export type ReserveLimitationKey = z.infer<typeof ReserveLimitationKeySchema>;
export type ReserveSummary = z.infer<typeof ReserveSummarySchema>;

// ---------------------------------------------------------------------------
// Safety Evaluation and Financial Runway Clock
// ---------------------------------------------------------------------------
//
// Composes Essential Burn, Emergency Reserve Sources, the protection profile,
// active high-cost debts, and the financial/salary profile into one versioned
// evaluation: a runway (survival time without salary) and a sequential safety
// ladder. Nothing here recomputes those inputs -- it only combines their
// already-authoritative results (docs/features/02-safety-ladder-runway/03-safety-evaluation/backend.md).
//
// Money stays integer paise; runway itself is expressed in basis points
// (10_000 bps = 1 month) so the backend never needs floating-point division
// to represent a fractional month, and BigInt is used for the intermediate
// multiply/divide (see apps/api/src/financial-safety/safety-evaluator.ts).

export const SAFETY_FORMULA_VERSION = 1;
export const SAFETY_POLICY_VERSION = 1;
export const SAFETY_TIMEZONE = "Asia/Kolkata" as const;

/** 10_000 basis points represents exactly one month of runway. */
export const SAFETY_RUNWAY_BASIS_POINTS_PER_MONTH = 10_000;
export const SAFETY_RUNWAY_CRITICAL_THRESHOLD_MONTHS = 3;
export const SAFETY_RUNWAY_FORTIFIED_THRESHOLD_MONTHS = 6;
export const SAFETY_RUNWAY_CRITICAL_THRESHOLD_BASIS_POINTS =
  SAFETY_RUNWAY_CRITICAL_THRESHOLD_MONTHS * SAFETY_RUNWAY_BASIS_POINTS_PER_MONTH;
export const SAFETY_RUNWAY_FORTIFIED_THRESHOLD_BASIS_POINTS =
  SAFETY_RUNWAY_FORTIFIED_THRESHOLD_MONTHS * SAFETY_RUNWAY_BASIS_POINTS_PER_MONTH;
/** Policy Version 1 uses a flat 30-day planning month for runway-day conversion. */
export const SAFETY_POLICY_DAYS_PER_MONTH = 30;
/** Survival-fortress policy benchmark: at least six months of Essential Burn. */
export const SAFETY_FORTRESS_TARGET_MONTHS = 6;
/** Minimum independent term-cover benchmark: 10x annual income basis. The preferred range (10x-15x) is copy-only; 10x is the pass/fail minimum. */
export const SAFETY_MIN_TERM_COVER_INCOME_MULTIPLE = 10;
/** Minimum independent health-cover benchmark (base + super top-up): Rs 15,00,000. */
export const SAFETY_MIN_HEALTH_COVER_MINOR = 15_00_000 * 100;

export const SafetyRunwayAvailabilitySchema = z.enum(["available", "unavailable"]);

export const SafetyRunwayUnavailableReasonSchema = z.enum([
  "essential_burn_unavailable",
  "essential_burn_zero",
  "no_eligible_reserve_source",
  "eligible_reserve_zero"
]);

export const SafetyRunwayTierSchema = z.enum(["critical", "healthy", "fortified", "unavailable"]);

export const SafetyEvaluationQualitySchema = z.enum(["complete", "limited"]);

export const SafetyStageSchema = z.enum([
  "ground_zero",
  "building_fortress",
  "buffer_layer",
  "wealth_ready"
]);

export const SafetyCheckKeySchema = z.enum([
  "term_protection",
  "health_protection",
  "high_cost_debt",
  "essential_burn",
  "emergency_reserves",
  "emergency_runway",
  "sinking_fund_buffer"
]);

export const SafetyCheckStatusSchema = z.enum([
  "complete",
  "incomplete",
  "unknown",
  "warning",
  "not_applicable",
  "not_assessable"
]);

export const SafetyActionKeySchema = z.enum([
  "configure_salary",
  "configure_protection",
  "review_debts",
  "review_categories",
  "review_transactions",
  "configure_reserves",
  "refresh_asset_valuations",
  "configure_safety_buffer",
  "none"
]);

export const SafetyIncomeBasisSchema = z.enum(["annual_ctc", "annualized_net_income", "unknown"]);

export const SafetyIncomeBasisQualitySchema = z.enum(["confirmed", "estimated", "unavailable"]);

export const SafetyTargetSourceSchema = z.enum(["policy", "user_preference"]);

export const SafetySnapshotStatusSchema = z.enum(["persisted", "live"]);

export const SafetyEvaluationIdSchema = z.string().uuid("Safety evaluation id must be a UUID.");

export const SafetyRunwaySchema = z.object({
  availability: SafetyRunwayAvailabilitySchema,
  unavailableReason: SafetyRunwayUnavailableReasonSchema.nullable(),
  tier: SafetyRunwayTierSchema,
  runwayBasisPoints: z.number().int().min(0).nullable(),
  runwayDays: z.number().int().min(0).nullable(),
  eligibleReserveMinor: SafeNonNegativeMinorSchema.nullable(),
  essentialBurnMinor: SafeNonNegativeMinorSchema.nullable(),
  observedCompleteMonthCount: z.number().int().min(0).max(3),
  // Plain positive integers, not z.literal(current constant): a persisted
  // evaluation carries the policy values that were effective when it was
  // computed, and must stay valid after a future policy version changes them
  // (see "policy-version coexistence" in the safety-evaluation spec).
  policyDaysPerMonth: z.number().int().min(1),
  criticalThresholdBasisPoints: z.number().int().min(0),
  fortifiedThresholdBasisPoints: z.number().int().min(0)
});

export const SafetyTargetSchema = z.object({
  policyTargetMinor: SafeNonNegativeMinorSchema,
  userTargetMinor: SafeNonNegativeMinorSchema.nullable(),
  effectiveTargetMinor: SafeNonNegativeMinorSchema,
  targetSource: SafetyTargetSourceSchema,
  targetMonths: z.number().int().min(1).nullable(),
  currentGapMinor: SafeNonNegativeMinorSchema,
  currentSurplusMinor: SafeNonNegativeMinorSchema
});

export const SafetyCheckEvidenceSchema = z.strictObject({
  observedCount: z.number().int().min(0).nullable().default(null),
  requiredCount: z.number().int().min(0).nullable().default(null),
  coverageMinor: SafeNonNegativeMinorSchema.nullable().default(null),
  benchmarkMinor: SafeNonNegativeMinorSchema.nullable().default(null),
  ratioBps: z.number().int().min(0).nullable().default(null),
  activeDebtCount: z.number().int().min(0).nullable().default(null),
  highCostDebtCount: z.number().int().min(0).nullable().default(null)
});

export const SafetyCheckSchema = z.object({
  key: SafetyCheckKeySchema,
  stage: SafetyStageSchema,
  status: SafetyCheckStatusSchema,
  attention: FinancialAttentionLevelSchema,
  summaryKey: z.string().min(1),
  evidence: SafetyCheckEvidenceSchema,
  limitationKeys: z.array(z.string()),
  action: SafetyActionKeySchema.nullable()
});

export const SafetyEssentialBurnEvidenceSchema = z.object({
  averageMonthlyEssentialMinor: SafeNonNegativeMinorSchema.nullable(),
  observedCompleteMonthCount: z.number().int().min(0).max(3),
  quality: EssentialBurnQualitySchema
});

export const SafetyReserveEvidenceSchema = z.object({
  totalEligibleMinor: SafeNonNegativeMinorSchema,
  instantMinor: SafeNonNegativeMinorSchema,
  tPlusOneMinor: SafeNonNegativeMinorSchema,
  lockedMinor: SafeNonNegativeMinorSchema,
  staleExcludedMinor: SafeNonNegativeMinorSchema,
  currentlyEligibleSourceCount: z.number().int().min(0),
  configuredSourceCount: z.number().int().min(0)
});

export const SafetyProtectionEvidenceSchema = z.object({
  termCoverState: ProtectionCoverageStateSchema,
  healthCoverState: ProtectionCoverageStateSchema,
  incomeBasis: SafetyIncomeBasisSchema,
  incomeBasisQuality: SafetyIncomeBasisQualitySchema,
  termBenchmarkMinor: SafeNonNegativeMinorSchema.nullable(),
  // Plain amount, not z.literal(current constant) -- see the runway policy
  // fields above for why evidence must stay valid across policy versions.
  healthBenchmarkMinor: SafeNonNegativeMinorSchema
});

export const SafetyDebtEvidenceSchema = z.object({
  activeDebtCount: z.number().int().min(0),
  highCostDebtCount: z.number().int().min(0)
});

export const SafetyEvaluationSchema = z.object({
  evaluationId: SafetyEvaluationIdSchema.nullable(),
  snapshotStatus: SafetySnapshotStatusSchema,
  computedAt: z.coerce.date(),
  asOf: z.coerce.date(),
  sourceThrough: z.coerce.date(),
  // Plain positive integers, not z.literal(current constant) -- a persisted
  // evaluation keeps the formula/policy version that produced it, which must
  // stay a different, still-valid value after the constant is bumped.
  formulaVersion: z.number().int().min(1),
  policyVersion: z.number().int().min(1),
  inputFingerprint: z.string().min(1),
  quality: SafetyEvaluationQualitySchema,
  currentStage: SafetyStageSchema,
  nextAction: SafetyActionKeySchema,
  runway: SafetyRunwaySchema,
  target: SafetyTargetSchema,
  checks: z.array(SafetyCheckSchema),
  limitations: z.array(z.string()),
  essentialBurnEvidence: SafetyEssentialBurnEvidenceSchema,
  reserveEvidence: SafetyReserveEvidenceSchema,
  protectionEvidence: SafetyProtectionEvidenceSchema,
  debtEvidence: SafetyDebtEvidenceSchema
});

export const SafetyEvaluationQuerySchema = z.object({
  asOf: z.coerce.date().optional()
});

export const SafetyEvaluationRefreshRequestSchema = z
  .object({
    asOf: z.coerce.date().optional()
  })
  .strict();

export const SafetyEvaluationRefreshResponseSchema = SafetyEvaluationSchema;

export type SafetyRunwayAvailability = z.infer<typeof SafetyRunwayAvailabilitySchema>;
export type SafetyRunwayUnavailableReason = z.infer<typeof SafetyRunwayUnavailableReasonSchema>;
export type SafetyRunwayTier = z.infer<typeof SafetyRunwayTierSchema>;
export type SafetyEvaluationQuality = z.infer<typeof SafetyEvaluationQualitySchema>;
export type SafetyStage = z.infer<typeof SafetyStageSchema>;
export type SafetyCheckKey = z.infer<typeof SafetyCheckKeySchema>;
export type SafetyCheckStatus = z.infer<typeof SafetyCheckStatusSchema>;
export type SafetyActionKey = z.infer<typeof SafetyActionKeySchema>;
export type SafetyIncomeBasis = z.infer<typeof SafetyIncomeBasisSchema>;
export type SafetyIncomeBasisQuality = z.infer<typeof SafetyIncomeBasisQualitySchema>;
export type SafetyTargetSource = z.infer<typeof SafetyTargetSourceSchema>;
export type SafetySnapshotStatus = z.infer<typeof SafetySnapshotStatusSchema>;
export type SafetyEvaluationId = z.infer<typeof SafetyEvaluationIdSchema>;
export type SafetyRunway = z.infer<typeof SafetyRunwaySchema>;
export type SafetyTarget = z.infer<typeof SafetyTargetSchema>;
export type SafetyCheckEvidence = z.infer<typeof SafetyCheckEvidenceSchema>;
export type SafetyCheck = z.infer<typeof SafetyCheckSchema>;
export type SafetyEssentialBurnEvidence = z.infer<typeof SafetyEssentialBurnEvidenceSchema>;
export type SafetyReserveEvidence = z.infer<typeof SafetyReserveEvidenceSchema>;
export type SafetyProtectionEvidence = z.infer<typeof SafetyProtectionEvidenceSchema>;
export type SafetyDebtEvidence = z.infer<typeof SafetyDebtEvidenceSchema>;
export type SafetyEvaluation = z.infer<typeof SafetyEvaluationSchema>;
export type SafetyEvaluationQuery = z.infer<typeof SafetyEvaluationQuerySchema>;
export type SafetyEvaluationRefreshRequest = z.infer<typeof SafetyEvaluationRefreshRequestSchema>;
export type SafetyEvaluationRefreshResponse = z.infer<typeof SafetyEvaluationRefreshResponseSchema>;
