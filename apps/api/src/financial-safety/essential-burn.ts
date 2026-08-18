import {
  divideMinorAmount,
  ESSENTIAL_BURN_FORMULA_VERSION,
  ESSENTIAL_BURN_REQUIRED_MONTHS,
  ESSENTIAL_BURN_TIMEZONE,
  EssentialBurnResponseSchema,
  sumMinorAmounts,
  type EssentialBurnClassification,
  type EssentialBurnCurrentMonth,
  type EssentialBurnLimitationKey,
  type EssentialBurnMonth,
  type EssentialBurnQuality,
  type EssentialBurnResponse,
  type Month
} from "@treasury-ops/shared";

export interface MonthlyLedgerExpenseFacts {
  readonly month: Month;
  readonly eligibleExpenseCount: number;
  readonly totalExpenseMinor: number;
  readonly essentialCount: number;
  readonly essentialMinor: number;
  readonly lifestyleCount: number;
  readonly lifestyleMinor: number;
  readonly uncategorizedCount: number;
  readonly uncategorizedMinor: number;
  readonly ungroupedCount: number;
  readonly ungroupedMinor: number;
}

export interface CalculateEssentialBurnInput {
  readonly asOf: Date;
  readonly computedAt?: Date;
  readonly candidateMonths: readonly [Month, Month, Month];
  readonly currentMonth: Month;
  readonly monthlyFacts: ReadonlyMap<string, MonthlyLedgerExpenseFacts>;
}

/**
 * Pure, deterministic calculator for Essential Burn Baseline (Formula Version 1).
 *
 * Rules:
 * 1. Evaluates the 3 immediately preceding complete Asia/Kolkata calendar months.
 * 2. An observed month has >= 1 eligible posted expense transaction.
 * 3. An observed month with zero essential expenses is a valid 0-paise observation.
 * 4. Missing months (zero expense transactions) are not treated as 0 and do not divide the sum.
 * 5. Current partial month is evaluated separately and strictly excluded from the baseline.
 * 6. Uses integer paise math and divideMinorAmount for rounding.
 */
export function calculateEssentialBurn(input: CalculateEssentialBurnInput): EssentialBurnResponse {
  const { asOf, candidateMonths, currentMonth, monthlyFacts } = input;
  const computedAt = input.computedAt ?? new Date();

  const completeMonths: [EssentialBurnMonth, EssentialBurnMonth, EssentialBurnMonth] = [
    buildMonthEntry(candidateMonths[0], monthlyFacts.get(candidateMonths[0])),
    buildMonthEntry(candidateMonths[1], monthlyFacts.get(candidateMonths[1])),
    buildMonthEntry(candidateMonths[2], monthlyFacts.get(candidateMonths[2]))
  ];

  const observedCompleteMonths = completeMonths.filter((m) => m.observation === "observed");
  const observedCompleteMonthCount = observedCompleteMonths.length;

  let quality: EssentialBurnQuality;
  let averageMonthlyEssentialMinor: number | null;

  if (observedCompleteMonthCount === 0) {
    quality = "unavailable";
    averageMonthlyEssentialMinor = null;
  } else if (observedCompleteMonthCount < ESSENTIAL_BURN_REQUIRED_MONTHS) {
    quality = "limited";
    const totalEssentialMinor = sumMinorAmounts(
      observedCompleteMonths.map((m) => m.essentialTotalMinor)
    );
    averageMonthlyEssentialMinor = divideMinorAmount(
      totalEssentialMinor,
      observedCompleteMonthCount
    );
  } else {
    quality = "complete";
    const totalEssentialMinor = sumMinorAmounts(
      observedCompleteMonths.map((m) => m.essentialTotalMinor)
    );
    averageMonthlyEssentialMinor = divideMinorAmount(
      totalEssentialMinor,
      ESSENTIAL_BURN_REQUIRED_MONTHS
    );
  }

  const curFacts = monthlyFacts.get(currentMonth);
  const currentPartialMonth: EssentialBurnCurrentMonth = {
    month: currentMonth,
    essentialTotalMinor: curFacts?.essentialMinor ?? 0,
    eligibleExpenseTransactionCount: curFacts?.eligibleExpenseCount ?? 0,
    essentialTransactionCount: curFacts?.essentialCount ?? 0,
    excludedFromBaseline: true
  };

  let totalEligibleCount = 0;
  let totalEssentialCount = 0;
  let totalLifestyleCount = 0;
  let totalUncategorizedCount = 0;
  let totalUncategorizedMinor = 0n;
  let totalUngroupedCount = 0;
  let totalUngroupedMinor = 0n;
  let totalCategorizedMinor = 0n;
  let totalUnclassifiedMinor = 0n;
  let totalExpenseMinor = 0n;

  for (const month of candidateMonths) {
    const facts = monthlyFacts.get(month);
    if (facts !== undefined) {
      totalEligibleCount += facts.eligibleExpenseCount;
      totalEssentialCount += facts.essentialCount;
      totalLifestyleCount += facts.lifestyleCount;
      totalUncategorizedCount += facts.uncategorizedCount;
      totalUncategorizedMinor += BigInt(facts.uncategorizedMinor);
      totalUngroupedCount += facts.ungroupedCount;
      totalUngroupedMinor += BigInt(facts.ungroupedMinor);
      totalCategorizedMinor += BigInt(facts.essentialMinor) + BigInt(facts.lifestyleMinor);
      totalUnclassifiedMinor += BigInt(facts.uncategorizedMinor) + BigInt(facts.ungroupedMinor);
      totalExpenseMinor += BigInt(facts.totalExpenseMinor);
    }
  }

  const coverageRatioBps =
    totalExpenseMinor === 0n ? null : Number((totalCategorizedMinor * 10000n) / totalExpenseMinor);

  const classification: EssentialBurnClassification = {
    eligibleExpenseTransactionCount: totalEligibleCount,
    essentialExpenseTransactionCount: totalEssentialCount,
    lifestyleExpenseTransactionCount: totalLifestyleCount,
    uncategorizedExpenseCount: totalUncategorizedCount,
    uncategorizedExpenseMinor: Number(totalUncategorizedMinor),
    ungroupedExpenseCount: totalUngroupedCount,
    ungroupedExpenseMinor: Number(totalUngroupedMinor),
    categorizedExpenseMinor: Number(totalCategorizedMinor),
    unclassifiedExpenseMinor: Number(totalUnclassifiedMinor),
    coverageRatioBps:
      coverageRatioBps !== null ? Math.min(10000, Math.max(0, coverageRatioBps)) : null,
    currentCategoryMetadataInUse: true
  };

  const limitations: EssentialBurnLimitationKey[] = ["current_category_metadata_in_use"];
  if (observedCompleteMonthCount === 0) {
    limitations.push("no_history");
  } else if (observedCompleteMonthCount < ESSENTIAL_BURN_REQUIRED_MONTHS) {
    limitations.push("insufficient_history");
  }
  if (totalUncategorizedCount > 0) {
    limitations.push("uncategorized_expenses_present");
  }
  if (totalUngroupedCount > 0) {
    limitations.push("ungrouped_categories_present");
  }
  limitations.push("partial_month_excluded");

  const response: EssentialBurnResponse = {
    computedAt,
    asOf,
    sourceThrough: computedAt,
    formulaVersion: ESSENTIAL_BURN_FORMULA_VERSION,
    timezone: ESSENTIAL_BURN_TIMEZONE,
    requiredCompleteMonths: ESSENTIAL_BURN_REQUIRED_MONTHS,
    observedCompleteMonthCount,
    averageMonthlyEssentialMinor,
    quality,
    completeMonths,
    currentPartialMonth,
    classification,
    limitations
  };

  return EssentialBurnResponseSchema.parse(response);
}

function buildMonthEntry(
  month: Month,
  facts: MonthlyLedgerExpenseFacts | undefined
): EssentialBurnMonth {
  if (facts === undefined || facts.eligibleExpenseCount === 0) {
    return {
      month,
      observation: "missing_history",
      essentialTotalMinor: 0,
      eligibleExpenseTransactionCount: 0,
      essentialTransactionCount: 0
    };
  }

  return {
    month,
    observation: "observed",
    essentialTotalMinor: facts.essentialMinor,
    eligibleExpenseTransactionCount: facts.eligibleExpenseCount,
    essentialTransactionCount: facts.essentialCount
  };
}
