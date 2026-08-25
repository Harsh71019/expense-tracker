import { z } from "zod";

/**
 * Financial readiness diagnostic contracts.
 *
 * This feature measures data completeness and readiness for calculations,
 * strictly separating readiness status (missing/estimated/limited/ready/stale)
 * from financial health condition (none/information/warning/blocking).
 *
 * Canonical rules (per docs/features/00-architecture/implementation-contract.md):
 * - No financial amounts are returned in the diagnostic response.
 * - No arbitrary URLs or paths are returned (closed action keys only).
 * - All timestamps are ISO 8601 UTC over the wire.
 */

export const BURN_HISTORY_REQUIRED_MONTHS = 3;
export const BURN_HISTORY_FRESHNESS_DAYS = 90;

export const ASSET_VALUATION_FRESHNESS_DAYS = {
  investment: 90,
  gold: 90,
  silver: 90,
  loan_liability: 90,
  loan_receivable: 90,
  fixed_deposit: 180,
  real_estate: 180,
  vehicle: 180,
  other: 180,
  default: 180
} as const;

export const FinancialReadinessStatusSchema = z.enum([
  "missing",
  "estimated",
  "limited",
  "ready",
  "stale"
]);

export const FinancialAttentionLevelSchema = z.enum(["none", "information", "warning", "blocking"]);

export const FinancialDiagnosticKeySchema = z.enum([
  "salary",
  "work_schedule",
  "accounts",
  "essential_categories",
  "burn_history",
  "protection",
  "debt_inventory",
  "safety_buffer",
  "assets",
  "asset_valuations",
  "goals",
  "reserve_sources"
]);

export const FinancialDiagnosticSourceKeySchema = z.enum([
  "financial_profile",
  "protection_profile",
  "debt_profile",
  "accounts",
  "categories",
  "ledger",
  "safety_buffer",
  "assets",
  "goals",
  "reserves"
]);

export const FinancialDiagnosticActionKeySchema = z.enum([
  "configure_salary",
  "configure_protection",
  "review_debts",
  "create_account",
  "review_categories",
  "review_transactions",
  "configure_safety_buffer",
  "review_assets",
  "refresh_asset_valuations",
  "create_goal",
  "configure_reserves"
]);

export const FINANCIAL_DIAGNOSTIC_ACTION_KEYS = FinancialDiagnosticActionKeySchema.options;
export const FINANCIAL_DIAGNOSTIC_KEYS = FinancialDiagnosticKeySchema.options;
export const FINANCIAL_READINESS_STATUSES = FinancialReadinessStatusSchema.options;
export const FINANCIAL_ATTENTION_LEVELS = FinancialAttentionLevelSchema.options;

export const FinancialCapabilityKeySchema = z.enum([
  "salary_statistics",
  "life_hour",
  "essential_burn",
  "financial_runway",
  "safety_ladder",
  "goal_feasibility",
  "payday_plan",
  "wealth_allocation",
  "projections"
]);

export const FINANCIAL_CAPABILITY_KEYS = FinancialCapabilityKeySchema.options;

export const FinancialDiagnosticOverallStatusSchema = z.enum([
  "setup_required",
  "limited",
  "ready"
]);

export const FINANCIAL_DIAGNOSTIC_OVERALL_STATUSES = FinancialDiagnosticOverallStatusSchema.options;

export const FinancialDiagnosticEvidenceSchema = z.strictObject({
  observedCount: z.number().int().min(0).nullable().default(null),
  requiredCount: z.number().int().min(0).nullable().default(null),
  completeMonthCount: z.number().int().min(0).nullable().default(null),
  activeCount: z.number().int().min(0).nullable().default(null),
  estimatedCount: z.number().int().min(0).nullable().default(null),
  staleCount: z.number().int().min(0).nullable().default(null),
  highCostDebtCount: z.number().int().min(0).nullable().default(null),
  missingValuationCount: z.number().int().min(0).nullable().default(null),
  latestObservedAt: z.coerce.date().nullable().default(null),
  oldestRelevantAt: z.coerce.date().nullable().default(null),
  freshnessThresholdDays: z.number().int().min(0).nullable().default(null)
});

export const FinancialReadinessItemSchema = z.object({
  key: FinancialDiagnosticKeySchema,
  status: FinancialReadinessStatusSchema,
  attention: FinancialAttentionLevelSchema,
  source: FinancialDiagnosticSourceKeySchema,
  lastUpdatedAt: z.coerce.date().nullable(),
  requiredFor: z.array(FinancialCapabilityKeySchema),
  action: FinancialDiagnosticActionKeySchema.nullable(),
  evidence: FinancialDiagnosticEvidenceSchema,
  summaryKey: z.string().min(1),
  limitationKeys: z.array(z.string())
});

export const FinancialDiagnosticSchema = z.object({
  computedAt: z.coerce.date(),
  sourceThrough: z.coerce.date(),
  formulaVersion: z.number().int().min(1),
  policyVersion: z.number().int().min(1),
  overallStatus: FinancialDiagnosticOverallStatusSchema,
  readyCount: z.number().int().min(0),
  totalRequiredCount: z.number().int().min(0),
  availableCapabilities: z.array(FinancialCapabilityKeySchema),
  unavailableCapabilities: z.array(FinancialCapabilityKeySchema),
  nextAction: FinancialDiagnosticActionKeySchema.nullable(),
  items: z.array(FinancialReadinessItemSchema),
  limitations: z.array(z.string())
});

export const FinancialDiagnosticQuerySchema = z.object({
  asOf: z.coerce.date().optional()
});

export type FinancialReadinessStatus = z.infer<typeof FinancialReadinessStatusSchema>;
export type FinancialAttentionLevel = z.infer<typeof FinancialAttentionLevelSchema>;
export type FinancialDiagnosticKey = z.infer<typeof FinancialDiagnosticKeySchema>;
export type FinancialDiagnosticSourceKey = z.infer<typeof FinancialDiagnosticSourceKeySchema>;
export type FinancialDiagnosticActionKey = z.infer<typeof FinancialDiagnosticActionKeySchema>;
export type FinancialCapabilityKey = z.infer<typeof FinancialCapabilityKeySchema>;
export type FinancialDiagnosticOverallStatus = z.infer<
  typeof FinancialDiagnosticOverallStatusSchema
>;
export type FinancialDiagnosticEvidence = z.infer<typeof FinancialDiagnosticEvidenceSchema>;
export type FinancialReadinessItem = z.infer<typeof FinancialReadinessItemSchema>;
export type FinancialDiagnostic = z.infer<typeof FinancialDiagnosticSchema>;
export type FinancialDiagnosticQuery = z.infer<typeof FinancialDiagnosticQuerySchema>;
