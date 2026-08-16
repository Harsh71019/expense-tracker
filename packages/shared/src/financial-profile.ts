import { z } from "zod";

import { PageInfoSchema } from "./pagination.js";

/**
 * Salary and work profile contracts.
 *
 * Canonical units, per docs/features/00-architecture/implementation-contract.md:
 * - money is integer paise (`*Minor`),
 * - rates are integer basis points (`*Bps`),
 * - work duration is integer minutes (`*Minutes`) — the API and UI may show
 *   hours, but hours never cross a runtime boundary,
 * - instants are ISO 8601 UTC; their calendar interpretation is Asia/Kolkata
 *   and belongs to the API (see apps/api/src/common/time/ist.ts).
 */

/** 160 h/month is the only value the product may propose; the user must confirm it. */
export const SUGGESTED_MONTHLY_WORK_HOURS = 160;
export const MINUTES_PER_HOUR = 60;
export const SUGGESTED_MONTHLY_WORK_MINUTES = SUGGESTED_MONTHLY_WORK_HOURS * MINUTES_PER_HOUR;
/** 31 days × 24 h × 60 min — a month cannot contain more working minutes than it has minutes. */
export const MAX_MONTHLY_WORK_MINUTES = 44_640;
export const MONTHS_PER_YEAR = 12;
/** A conventional eight-hour workday, used only for the workday-equivalent statistic. */
export const STANDARD_WORKDAY_MINUTES = 480;
/** 100_000 bps = 1000%: generous, but bounded so projections cannot overflow. */
export const MAX_ANNUAL_INCREMENT_BPS = 100_000;

const PositiveMinorSchema = z
  .number()
  .int("Money must be an integer number of paise.")
  .min(1, "Money must be greater than zero.")
  .max(Number.MAX_SAFE_INTEGER, "Money exceeds the supported paise range.");

const NonNegativeMinorSchema = z
  .number()
  .int("Money must be an integer number of paise.")
  .min(0)
  .max(Number.MAX_SAFE_INTEGER, "Money exceeds the supported paise range.");

export const IncomeStabilitySchema = z.enum(["stable", "variable", "irregular"]);

/** Only manual entry exists today; detection sources arrive with later features. */
export const SalarySourceSchema = z.enum(["manually_confirmed"]);

export const FinancialDataQualitySchema = z.enum(["complete", "limited", "stale", "unavailable"]);

export const MonthlyWorkMinutesSchema = z
  .number()
  .int("Monthly work minutes must be a whole number of minutes.")
  .min(1, "Monthly work minutes must be greater than zero.")
  .max(MAX_MONTHLY_WORK_MINUTES, "Monthly work minutes exceed the minutes available in a month.");

export const SalaryCreditDaySchema = z
  .number()
  .int("Salary credit day must be a whole day of the month.")
  .min(1, "Salary credit day must be between 1 and 31.")
  .max(31, "Salary credit day must be between 1 and 31.");

export const AnnualIncrementBpsSchema = z
  .number()
  .int("Increment must be an integer number of basis points.")
  .min(0, "Increment cannot be negative.")
  .max(MAX_ANNUAL_INCREMENT_BPS, "Increment exceeds the supported basis-point range.");

export const SalaryVersionIdSchema = z.string().uuid("Salary version id must be a UUID.");

export const FinancialProfileSchema = z.object({
  userId: z.string().min(1),
  monthlyWorkMinutes: MonthlyWorkMinutesSchema,
  salaryCreditDay: SalaryCreditDaySchema.nullable(),
  expectedAnnualIncrementBps: AnnualIncrementBpsSchema.nullable(),
  incomeStability: IncomeStabilitySchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

/**
 * The profile holds only four stable preferences, so the PATCH body carries
 * all of them: work minutes and stability are always required, and the two
 * optional facts are explicitly `null` when cleared. Salary itself is never
 * part of this body — it is effective-dated and appended through
 * `POST /v1/financial-profile/salary-versions`.
 */
export const FinancialProfileUpdateSchema = z.strictObject({
  monthlyWorkMinutes: MonthlyWorkMinutesSchema,
  incomeStability: IncomeStabilitySchema,
  salaryCreditDay: SalaryCreditDaySchema.nullable().default(null),
  expectedAnnualIncrementBps: AnnualIncrementBpsSchema.nullable().default(null)
});

export const SalaryVersionSchema = z.object({
  id: SalaryVersionIdSchema,
  userId: z.string().min(1),
  netMonthlySalaryMinor: PositiveMinorSchema,
  annualCtcMinor: PositiveMinorSchema.nullable(),
  effectiveFrom: z.coerce.date(),
  source: SalarySourceSchema,
  createdAt: z.coerce.date()
});

export const CreateSalaryVersionSchema = z.strictObject({
  netMonthlySalaryMinor: PositiveMinorSchema,
  annualCtcMinor: PositiveMinorSchema.nullable().default(null),
  effectiveFrom: z.coerce.date()
});

export const ListSalaryVersionsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const SalaryVersionPageSchema = z.object({
  items: z.array(SalaryVersionSchema),
  pageInfo: PageInfoSchema
});

export const SalaryStatisticsQuerySchema = z.object({
  asOf: z.coerce.date().optional()
});

export const SalaryStatisticsAssumptionsSchema = z.object({
  monthsPerYear: z.number().int().min(1),
  minutesPerHour: z.number().int().min(1),
  standardWorkdayMinutes: z.number().int().min(1),
  monthlyWorkMinutes: MonthlyWorkMinutesSchema,
  incomeStability: IncomeStabilitySchema,
  expectedAnnualIncrementBps: AnnualIncrementBpsSchema.nullable(),
  rounding: z.literal("half_up")
});

/**
 * Server-authoritative derived salary figures. Everything here is computed
 * from the *net in-hand* salary; annual CTC is never treated as spendable
 * income and therefore never feeds these numbers.
 */
export const SalaryStatisticsSchema = z.object({
  currentNetMonthlySalaryMinor: PositiveMinorSchema,
  annualizedNetIncomeMinor: PositiveMinorSchema,
  netHourlyWageMinor: NonNegativeMinorSchema,
  eightHourWorkdayEquivalentMinor: NonNegativeMinorSchema,
  effectiveFrom: z.coerce.date(),
  monthlyWorkMinutes: MonthlyWorkMinutesSchema,
  salaryVersionId: SalaryVersionIdSchema,
  computedAt: z.coerce.date(),
  formulaVersion: z.number().int().min(1),
  dataQuality: FinancialDataQualitySchema,
  assumptions: SalaryStatisticsAssumptionsSchema,
  limitations: z.array(z.string())
});

/**
 * `GET /v1/financial-profile` never fabricates defaults: an unconfigured user
 * gets `configured: false` plus the one value the product may propose.
 */
export const FinancialProfileStateSchema = z.object({
  configured: z.boolean(),
  profile: FinancialProfileSchema.nullable(),
  currentSalaryVersion: SalaryVersionSchema.nullable(),
  upcomingSalaryVersion: SalaryVersionSchema.nullable(),
  suggestedMonthlyWorkMinutes: MonthlyWorkMinutesSchema,
  asOf: z.coerce.date()
});

export type IncomeStability = z.infer<typeof IncomeStabilitySchema>;
export type SalarySource = z.infer<typeof SalarySourceSchema>;
export type FinancialDataQuality = z.infer<typeof FinancialDataQualitySchema>;
export type FinancialProfile = z.infer<typeof FinancialProfileSchema>;
export type FinancialProfileUpdate = z.infer<typeof FinancialProfileUpdateSchema>;
export type FinancialProfileState = z.infer<typeof FinancialProfileStateSchema>;
export type SalaryVersion = z.infer<typeof SalaryVersionSchema>;
export type SalaryVersionId = z.infer<typeof SalaryVersionIdSchema>;
export type CreateSalaryVersion = z.infer<typeof CreateSalaryVersionSchema>;
export type ListSalaryVersionsQuery = z.infer<typeof ListSalaryVersionsQuerySchema>;
export type SalaryVersionPage = z.infer<typeof SalaryVersionPageSchema>;
export type SalaryStatistics = z.infer<typeof SalaryStatisticsSchema>;
export type SalaryStatisticsAssumptions = z.infer<typeof SalaryStatisticsAssumptionsSchema>;
export type SalaryStatisticsQuery = z.infer<typeof SalaryStatisticsQuerySchema>;

/** Whole hours → canonical minutes. Rejects fractional or out-of-range hours. */
export function monthlyWorkMinutesFromHours(hours: number): number {
  if (!Number.isFinite(hours)) {
    throw new RangeError("Monthly work hours must be a finite number.");
  }
  const minutes = Math.round(hours * MINUTES_PER_HOUR);
  if (Math.abs(hours * MINUTES_PER_HOUR - minutes) > Number.EPSILON * MINUTES_PER_HOUR) {
    throw new RangeError("Monthly work hours must resolve to whole minutes.");
  }
  return MonthlyWorkMinutesSchema.parse(minutes);
}

/** Canonical minutes → hours for display only; never feeds a calculation. */
export function monthlyWorkHoursFromMinutes(minutes: number): number {
  return MonthlyWorkMinutesSchema.parse(minutes) / MINUTES_PER_HOUR;
}
