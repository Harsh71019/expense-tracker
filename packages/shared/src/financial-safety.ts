import { z } from "zod";
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
