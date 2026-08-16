import { z } from "zod";

import { AssetIdSchema } from "./asset.js";
import { FinancialDataQualitySchema } from "./financial-profile.js";
import { PageInfoSchema } from "./pagination.js";

/**
 * Protection and high-cost debt contracts.
 *
 * These are *facts the user tells us*, not products, advice, or ledger money:
 * - insurance cover is a protection fact and never an asset or net-worth
 *   component (docs/features/00-architecture/implementation-contract.md),
 * - a declared debt is planning metadata; an actual payoff is still a ledger
 *   transaction, and resolving a debt here moves no money,
 * - money is integer paise (`*Minor`), rates are integer basis points
 *   (`*Bps`), instants are ISO 8601 UTC whose calendar interpretation is
 *   Asia/Kolkata and belongs to the API.
 *
 * Nothing here stores a policy number, insurer credential, document, card PAN,
 * or any free-text medical detail — the schemas are strict objects precisely so
 * an unknown key cannot smuggle one in.
 */

/**
 * A debt is "high cost" strictly *above* 12% p.a. Exactly 1200 bps is not high
 * cost; the comparison is `>` and lives in `isHighCostDebt` so the boundary is
 * defined once rather than re-derived at each call site.
 */
export const HIGH_COST_DEBT_ANNUAL_RATE_BPS = 1_200;

/** 100_000 bps = 1000% p.a.: generous for penal rates, still bounded. */
export const MAX_DEBT_ANNUAL_RATE_BPS = 100_000;

/** A bounded dependant count — high enough to be honest, low enough to be a typo guard. */
export const MAX_DEPENDANT_COUNT = 20;

/** An independent policy inside this window is surfaced as "expiring", not "active". */
export const PROTECTION_EXPIRING_SOON_DAYS = 90;

/** `true` only when the annual rate is strictly greater than the 12% threshold. */
export function isHighCostDebt(annualRateBps: number): boolean {
  return annualRateBps > HIGH_COST_DEBT_ANNUAL_RATE_BPS;
}

const PositiveMinorSchema = z
  .number()
  .int("Money must be an integer number of paise.")
  .min(1, "Money must be greater than zero.")
  .max(Number.MAX_SAFE_INTEGER, "Money exceeds the supported paise range.");

export const DebtAnnualRateBpsSchema = z
  .number()
  .int("Annual rate must be an integer number of basis points.")
  .min(0, "Annual rate cannot be negative.")
  .max(MAX_DEBT_ANNUAL_RATE_BPS, "Annual rate exceeds the supported basis-point range.");

export const DependantCountSchema = z
  .number()
  .int("Dependant count must be a whole number.")
  .min(0, "Dependant count cannot be negative.")
  .max(MAX_DEPENDANT_COUNT, `Dependant count cannot exceed ${MAX_DEPENDANT_COUNT}.`);

/* ------------------------------------------------------------------ *
 * Protection
 * ------------------------------------------------------------------ */

export const ProtectionSnapshotIdSchema = z.string().uuid("Protection snapshot id must be a UUID.");

/**
 * `employer_only` must stay distinguishable from `independent`: employer cover
 * usually ends with the employment, so collapsing the two would silently turn a
 * fragile situation into a safe-looking one. `not_sure` is a first-class answer
 * for the same reason — missing information stays visible.
 */
export const TermCoverStatusSchema = z.enum([
  "independent",
  "employer_only",
  "both",
  "none",
  "not_sure",
  "not_applicable"
]);

/** Health cover has no "not applicable" case in V1 — everyone can hold health cover. */
export const HealthCoverStatusSchema = z.enum([
  "independent",
  "employer_only",
  "both",
  "none",
  "not_sure"
]);

/**
 * A closed list on purpose. "Term life does not apply to me" is a legitimate
 * answer, but it must be a structured reason we can reason about later — never
 * free text, which would become an unreviewed place to type personal detail.
 */
export const TermNotApplicableReasonSchema = z.enum([
  "no_financial_dependants",
  "covered_by_existing_family_arrangement",
  "other_personal_reason"
]);

/** Same four states as every other calculated envelope in this product. */
export const ProtectionDataQualitySchema = FinancialDataQualitySchema;

/** Per-cover rollup the UI renders; the server owns it, the client never derives it. */
export const ProtectionCoverageStateSchema = z.enum([
  "not_configured",
  "complete",
  "incomplete",
  "unknown",
  "employer_only",
  "none_declared",
  "not_applicable"
]);

export const ProtectionExpiryStateSchema = z.enum([
  "not_applicable",
  "active",
  "expiring",
  "expired"
]);

export const ProtectionSnapshotSchema = z.object({
  id: ProtectionSnapshotIdSchema,
  userId: z.string().min(1),
  effectiveFrom: z.coerce.date(),
  termCoverStatus: TermCoverStatusSchema,
  independentTermCoverMinor: PositiveMinorSchema.nullable(),
  employerTermCoverMinor: PositiveMinorSchema.nullable(),
  independentTermExpiresOn: z.coerce.date().nullable(),
  termNotApplicableReason: TermNotApplicableReasonSchema.nullable(),
  healthCoverStatus: HealthCoverStatusSchema,
  independentHealthBaseCoverMinor: PositiveMinorSchema.nullable(),
  independentHealthSuperTopUpMinor: PositiveMinorSchema.nullable(),
  employerHealthCoverMinor: PositiveMinorSchema.nullable(),
  independentHealthExpiresOn: z.coerce.date().nullable(),
  dependantCount: DependantCountSchema,
  createdAt: z.coerce.date()
});

const UpsertProtectionShape = z.strictObject({
  effectiveFrom: z.coerce.date(),
  termCoverStatus: TermCoverStatusSchema,
  independentTermCoverMinor: PositiveMinorSchema.nullable().default(null),
  employerTermCoverMinor: PositiveMinorSchema.nullable().default(null),
  independentTermExpiresOn: z.coerce.date().nullable().default(null),
  termNotApplicableReason: TermNotApplicableReasonSchema.nullable().default(null),
  healthCoverStatus: HealthCoverStatusSchema,
  independentHealthBaseCoverMinor: PositiveMinorSchema.nullable().default(null),
  independentHealthSuperTopUpMinor: PositiveMinorSchema.nullable().default(null),
  employerHealthCoverMinor: PositiveMinorSchema.nullable().default(null),
  independentHealthExpiresOn: z.coerce.date().nullable().default(null),
  dependantCount: DependantCountSchema
});

/** Statuses that legitimately carry an independently-held cover amount. */
export function statusHasIndependentCover(status: string): boolean {
  return status === "independent" || status === "both";
}

/** Statuses that legitimately carry an employer-provided cover amount. */
export function statusHasEmployerCover(status: string): boolean {
  return status === "employer_only" || status === "both";
}

/**
 * The PUT body. Amounts are *permitted* rather than required when a status
 * claims cover: a user may know they hold a policy without remembering the sum
 * assured, and the honest outcome of that is an "incomplete" protection state,
 * not a rejected form or an invented number.
 */
export const UpsertProtectionSchema = UpsertProtectionShape.superRefine((value, ctx) => {
  const notApplicable = value.termCoverStatus === "not_applicable";
  if (notApplicable && value.termNotApplicableReason === null) {
    ctx.addIssue({
      code: "custom",
      path: ["termNotApplicableReason"],
      message: "Choose why term cover does not apply to you."
    });
  }
  if (!notApplicable && value.termNotApplicableReason !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["termNotApplicableReason"],
      message: "A not-applicable reason only belongs with a not-applicable term cover status."
    });
  }

  if (!statusHasIndependentCover(value.termCoverStatus)) {
    if (value.independentTermCoverMinor !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["independentTermCoverMinor"],
        message: "Independent term cover only belongs with independently held term cover."
      });
    }
    if (value.independentTermExpiresOn !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["independentTermExpiresOn"],
        message: "A term policy expiry only belongs with independently held term cover."
      });
    }
  }
  if (!statusHasEmployerCover(value.termCoverStatus) && value.employerTermCoverMinor !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["employerTermCoverMinor"],
      message: "Employer term cover only belongs with employer-provided term cover."
    });
  }

  if (!statusHasIndependentCover(value.healthCoverStatus)) {
    if (value.independentHealthBaseCoverMinor !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["independentHealthBaseCoverMinor"],
        message: "Independent health cover only belongs with independently held health cover."
      });
    }
    if (value.independentHealthSuperTopUpMinor !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["independentHealthSuperTopUpMinor"],
        message: "A super top-up only belongs with independently held health cover."
      });
    }
    if (value.independentHealthExpiresOn !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["independentHealthExpiresOn"],
        message: "A health policy expiry only belongs with independently held health cover."
      });
    }
  }
  if (!statusHasEmployerCover(value.healthCoverStatus) && value.employerHealthCoverMinor !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["employerHealthCoverMinor"],
      message: "Employer health cover only belongs with employer-provided health cover."
    });
  }
});

export const ProtectionCoverageSummarySchema = z.object({
  state: ProtectionCoverageStateSchema,
  expiryState: ProtectionExpiryStateSchema,
  expiresOn: z.coerce.date().nullable(),
  hasIndependentCover: z.boolean(),
  hasEmployerCover: z.boolean()
});

/**
 * `GET /v1/financial-profile/protection` never fabricates a safe answer: with
 * no snapshot the states are `not_configured` and the data quality is
 * `unavailable`, which is what the UI must show — not a green tick.
 */
export const ProtectionStateSchema = z.object({
  configured: z.boolean(),
  currentSnapshot: ProtectionSnapshotSchema.nullable(),
  upcomingSnapshot: ProtectionSnapshotSchema.nullable(),
  asOf: z.coerce.date(),
  dataQuality: ProtectionDataQualitySchema,
  termCover: ProtectionCoverageSummarySchema,
  healthCover: ProtectionCoverageSummarySchema,
  expiringSoonDays: z.number().int().positive(),
  limitations: z.array(z.string())
});

/* ------------------------------------------------------------------ *
 * Declared debts
 * ------------------------------------------------------------------ */

export const DeclaredDebtIdSchema = z.string().uuid("Declared debt id must be a UUID.");

export const DeclaredDebtKindSchema = z.enum([
  "credit_card",
  "bnpl",
  "personal_loan",
  "consumer_loan",
  "other"
]);

/** `resolved` means "stop counting this in planning", never "this was paid". */
export const DeclaredDebtStatusSchema = z.enum(["active", "resolved"]);

export const DebtAmountSourceSchema = z.enum(["declared", "linked_asset"]);

export const CreateDeclaredDebtSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80),
    kind: DeclaredDebtKindSchema,
    declaredOutstandingMinor: PositiveMinorSchema.nullable().default(null),
    annualRateBps: DebtAnnualRateBpsSchema,
    minimumPaymentMinor: PositiveMinorSchema.nullable().default(null),
    linkedAssetId: AssetIdSchema.nullable().default(null)
  })
  .superRefine((value, ctx) => {
    // A linked debt's outstanding amount is *derived* from the asset's latest
    // valuation. Storing a second copy here would create two numbers that drift.
    if (value.linkedAssetId !== null && value.declaredOutstandingMinor !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["declaredOutstandingMinor"],
        message: "A linked debt takes its outstanding amount from the linked asset's valuation."
      });
    }
    if (value.linkedAssetId === null && value.declaredOutstandingMinor === null) {
      ctx.addIssue({
        code: "custom",
        path: ["declaredOutstandingMinor"],
        message: "Enter the outstanding amount, or link this debt to a loan liability."
      });
    }
  });

/**
 * Only metadata. `linkedAssetId` is deliberately absent: relinking is a
 * different decision with different ownership checks, so it happens by
 * declaring a new debt rather than by mutating an existing one — which also
 * makes "must not silently unlink on a failed asset lookup" true by
 * construction.
 */
export const UpdateDeclaredDebtSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80).optional(),
    kind: DeclaredDebtKindSchema.optional(),
    declaredOutstandingMinor: PositiveMinorSchema.optional(),
    annualRateBps: DebtAnnualRateBpsSchema.optional(),
    minimumPaymentMinor: PositiveMinorSchema.nullable().optional(),
    status: z.literal("resolved").optional()
  })
  .superRefine((value, ctx) => {
    if (Object.values(value).every((field) => field === undefined)) {
      ctx.addIssue({ code: "custom", path: [], message: "Provide at least one field to update." });
    }
  });

export const DeclaredDebtSchema = z.object({
  id: DeclaredDebtIdSchema,
  userId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  kind: DeclaredDebtKindSchema,
  /** The user's own estimate; always `null` for a linked debt. */
  declaredOutstandingMinor: PositiveMinorSchema.nullable(),
  /**
   * The value to plan with: the declared estimate, or the absolute value of the
   * linked asset's latest valuation. `null` when a linked asset has no
   * valuation yet — an explicitly missing number, never a silent zero.
   */
  outstandingMinor: PositiveMinorSchema.nullable(),
  annualRateBps: DebtAnnualRateBpsSchema,
  minimumPaymentMinor: PositiveMinorSchema.nullable(),
  linkedAssetId: AssetIdSchema.nullable(),
  linkedAssetName: z.string().nullable(),
  amountSource: DebtAmountSourceSchema,
  valuationAsOf: z.coerce.date().nullable(),
  isEstimate: z.boolean(),
  isHighCost: z.boolean(),
  status: DeclaredDebtStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  resolvedAt: z.coerce.date().nullable()
});

/** The threshold travels with the data so the UI never hardcodes 12%. */
export const DebtHighCostPolicySchema = z.object({
  thresholdBps: z.number().int().min(0),
  comparison: z.literal("greater_than"),
  highCostCount: z.number().int().min(0)
});

export const DeclaredDebtPageSchema = z.object({
  items: z.array(DeclaredDebtSchema),
  pageInfo: PageInfoSchema,
  highCost: DebtHighCostPolicySchema
});

export const ListDeclaredDebtsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: DeclaredDebtStatusSchema.default("active")
});

export type ProtectionSnapshotId = z.infer<typeof ProtectionSnapshotIdSchema>;
export type TermCoverStatus = z.infer<typeof TermCoverStatusSchema>;
export type HealthCoverStatus = z.infer<typeof HealthCoverStatusSchema>;
export type TermNotApplicableReason = z.infer<typeof TermNotApplicableReasonSchema>;
export type ProtectionSnapshot = z.infer<typeof ProtectionSnapshotSchema>;
export type UpsertProtection = z.infer<typeof UpsertProtectionSchema>;
export type ProtectionState = z.infer<typeof ProtectionStateSchema>;
export type ProtectionDataQuality = z.infer<typeof ProtectionDataQualitySchema>;
export type ProtectionCoverageState = z.infer<typeof ProtectionCoverageStateSchema>;
export type ProtectionCoverageSummary = z.infer<typeof ProtectionCoverageSummarySchema>;
export type ProtectionExpiryState = z.infer<typeof ProtectionExpiryStateSchema>;
export type DeclaredDebtId = z.infer<typeof DeclaredDebtIdSchema>;
export type DeclaredDebtKind = z.infer<typeof DeclaredDebtKindSchema>;
export type DeclaredDebtStatus = z.infer<typeof DeclaredDebtStatusSchema>;
export type DebtAmountSource = z.infer<typeof DebtAmountSourceSchema>;
export type CreateDeclaredDebt = z.infer<typeof CreateDeclaredDebtSchema>;
export type UpdateDeclaredDebt = z.infer<typeof UpdateDeclaredDebtSchema>;
export type DeclaredDebt = z.infer<typeof DeclaredDebtSchema>;
export type DebtHighCostPolicy = z.infer<typeof DebtHighCostPolicySchema>;
export type DeclaredDebtPage = z.infer<typeof DeclaredDebtPageSchema>;
export type ListDeclaredDebtsQuery = z.infer<typeof ListDeclaredDebtsQuerySchema>;
