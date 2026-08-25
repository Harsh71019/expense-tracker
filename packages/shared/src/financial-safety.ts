import { z } from "zod";
import { AccountTypeSchema } from "./account.js";
import { AssetKindSchema } from "./asset.js";
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
