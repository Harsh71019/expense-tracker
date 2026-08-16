import {
  MINUTES_PER_HOUR,
  MONTHS_PER_YEAR,
  STANDARD_WORKDAY_MINUTES,
  parseSafeIntegerMinor,
  type FinancialDataQuality,
  type FinancialProfile,
  type SalaryStatistics,
  type SalaryVersion
} from "@treasury-ops/shared";

/**
 * @file Pure salary statistics.
 *
 * Nothing here touches NestJS, Drizzle, HTTP, or the clock — every input is
 * passed in, so each figure is reproducible from a stored snapshot. All money
 * stays in integer paise and every division states its rounding.
 */

/** Bump when a formula changes so previously displayed results stay explainable. */
export const SALARY_STATISTICS_FORMULA_VERSION = 1;

/** A salary older than this is still used, but reported as stale. */
export const SALARY_STALE_AFTER_MONTHS = 18;

const MILLISECONDS_PER_APPROXIMATE_MONTH = 30 * 24 * 60 * 60 * 1_000;

/**
 * Scales a non-negative paise amount by `multiplier / divisor` in bigint, so
 * the intermediate product can never lose precision or overflow a JS number.
 *
 * Rounding: half away from zero on non-negative input — an exact half rounds
 * up (₹0.005 → 1 paisa). `divideMinorAmount` in `packages/shared/money.ts`
 * uses the same convention but cannot express the multiply-then-divide the
 * hourly/workday figures need, so this is the one extra primitive this module
 * owns. Throws `RangeError` when the result leaves the safe-integer range.
 */
export function scaleMinorAmount(amountMinor: number, multiplier: number, divisor: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError("Amount must be a non-negative integer in paise.");
  }
  if (!Number.isSafeInteger(multiplier) || multiplier <= 0) {
    throw new RangeError("Multiplier must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new RangeError("Divisor must be a positive safe integer.");
  }

  const scaled =
    (BigInt(amountMinor) * BigInt(multiplier) + BigInt(Math.floor(divisor / 2))) / BigInt(divisor);
  return parseSafeIntegerMinor(scaled);
}

/** Net monthly in-hand salary × 12. Annual CTC is never used here. */
export function annualizedNetIncomeMinor(netMonthlySalaryMinor: number): number {
  return scaleMinorAmount(netMonthlySalaryMinor, MONTHS_PER_YEAR, 1);
}

/** Net monthly salary per worked hour, rounded to the nearest paisa. */
export function netHourlyWageMinor(
  netMonthlySalaryMinor: number,
  monthlyWorkMinutes: number
): number {
  return scaleMinorAmount(netMonthlySalaryMinor, MINUTES_PER_HOUR, monthlyWorkMinutes);
}

/** What a conventional eight-hour day of work is worth, rounded to the nearest paisa. */
export function eightHourWorkdayEquivalentMinor(
  netMonthlySalaryMinor: number,
  monthlyWorkMinutes: number
): number {
  return scaleMinorAmount(netMonthlySalaryMinor, STANDARD_WORKDAY_MINUTES, monthlyWorkMinutes);
}

/**
 * The version in force on `asOf`: the newest `effectiveFrom <= asOf`, with a
 * stable descending-id tie-break so two versions sharing an instant (which
 * the unique index prevents, but the calculator must not assume) always
 * resolve the same way. Future-dated versions are excluded.
 */
export function selectEffectiveSalaryVersion(
  versions: readonly SalaryVersion[],
  asOf: Date
): SalaryVersion | null {
  let selected: SalaryVersion | null = null;
  for (const version of versions) {
    if (version.effectiveFrom.getTime() > asOf.getTime()) continue;
    if (selected === null) {
      selected = version;
      continue;
    }
    const newer = version.effectiveFrom.getTime() > selected.effectiveFrom.getTime();
    const sameInstant = version.effectiveFrom.getTime() === selected.effectiveFrom.getTime();
    if (newer || (sameInstant && version.id > selected.id)) {
      selected = version;
    }
  }
  return selected;
}

/** The earliest version that has not taken effect yet, if any. */
export function selectUpcomingSalaryVersion(
  versions: readonly SalaryVersion[],
  asOf: Date
): SalaryVersion | null {
  let selected: SalaryVersion | null = null;
  for (const version of versions) {
    if (version.effectiveFrom.getTime() <= asOf.getTime()) continue;
    if (selected === null || version.effectiveFrom.getTime() < selected.effectiveFrom.getTime()) {
      selected = version;
    }
  }
  return selected;
}

export type SalaryStatisticsInput = Readonly<{
  profile: FinancialProfile;
  effectiveVersion: SalaryVersion;
  upcomingVersion: SalaryVersion | null;
  asOf: Date;
  computedAt: Date;
}>;

/**
 * Assembles the full statistics envelope. `dataQuality` degrades to
 * `"limited"` when the user's income is not stable (a single monthly figure
 * cannot represent it) and to `"stale"` when the effective salary predates
 * `asOf` by more than {@link SALARY_STALE_AFTER_MONTHS}; a stale, unstable
 * salary reports `"stale"`, the more actionable of the two.
 */
export function calculateSalaryStatistics(input: SalaryStatisticsInput): SalaryStatistics {
  const { profile, effectiveVersion, upcomingVersion, asOf, computedAt } = input;
  const netMonthly = effectiveVersion.netMonthlySalaryMinor;
  const monthlyWorkMinutes = profile.monthlyWorkMinutes;

  const limitations: string[] = [];
  const monthsSinceEffective =
    (asOf.getTime() - effectiveVersion.effectiveFrom.getTime()) /
    MILLISECONDS_PER_APPROXIMATE_MONTH;
  const stale = monthsSinceEffective > SALARY_STALE_AFTER_MONTHS;

  if (profile.incomeStability !== "stable") {
    limitations.push(
      `Income is marked ${profile.incomeStability}, so a single monthly figure may not match what actually arrives each month.`
    );
  }
  if (stale) {
    limitations.push(
      `The effective salary has not changed in over ${SALARY_STALE_AFTER_MONTHS} months. Add a salary change if it is out of date.`
    );
  }
  if (upcomingVersion !== null) {
    limitations.push(
      `A future salary change takes effect on ${upcomingVersion.effectiveFrom.toISOString()} and is not included here.`
    );
  }
  if (effectiveVersion.annualCtcMinor !== null) {
    limitations.push(
      "Annual CTC is recorded but excluded from every figure here; only net in-hand salary is spendable income."
    );
  }

  const dataQuality: FinancialDataQuality = stale
    ? "stale"
    : profile.incomeStability === "stable"
      ? "complete"
      : "limited";

  return {
    currentNetMonthlySalaryMinor: netMonthly,
    annualizedNetIncomeMinor: annualizedNetIncomeMinor(netMonthly),
    netHourlyWageMinor: netHourlyWageMinor(netMonthly, monthlyWorkMinutes),
    eightHourWorkdayEquivalentMinor: eightHourWorkdayEquivalentMinor(
      netMonthly,
      monthlyWorkMinutes
    ),
    effectiveFrom: effectiveVersion.effectiveFrom,
    monthlyWorkMinutes,
    salaryVersionId: effectiveVersion.id,
    computedAt,
    formulaVersion: SALARY_STATISTICS_FORMULA_VERSION,
    dataQuality,
    assumptions: {
      monthsPerYear: MONTHS_PER_YEAR,
      minutesPerHour: MINUTES_PER_HOUR,
      standardWorkdayMinutes: STANDARD_WORKDAY_MINUTES,
      monthlyWorkMinutes,
      incomeStability: profile.incomeStability,
      expectedAnnualIncrementBps: profile.expectedAnnualIncrementBps,
      rounding: "half_up"
    },
    limitations
  };
}
