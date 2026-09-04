import {
  parseSafeIntegerMinor,
  SafetyCheckSchema,
  SafetyRunwaySchema,
  SafetyTargetSchema,
  type EssentialBurnResponse,
  type FinancialAttentionLevel,
  type FinancialProfileState,
  type ProtectionState,
  type ReserveSummary,
  type SafetyActionKey,
  type SafetyCheck,
  type SafetyCheckEvidence,
  type SafetyCheckKey,
  type SafetyCheckStatus,
  type SafetyDebtEvidence,
  type SafetyEssentialBurnEvidence,
  type SafetyIncomeBasis,
  type SafetyIncomeBasisQuality,
  type SafetyProtectionEvidence,
  type SafetyReserveEvidence,
  type SafetyRunway,
  type SafetyStage,
  type SafetyTarget,
  type SafetyEvaluationQuality
} from "@treasury-ops/shared";
import type { SafetyBufferState } from "@treasury-ops/shared";

import { SAFETY_POLICY } from "./safety-policy.js";

/**
 * Pure, deterministic Safety Evaluation evaluator (Formula/Policy Version 1).
 *
 * Rules:
 * - No NestJS, Drizzle, HTTP imports -- every fact (Essential Burn, Reserve
 *   Value, protection state, active debt counts, financial profile, safety
 *   buffer preference) is gathered by the caller and passed in already
 *   authoritative.
 * - Runway math uses BigInt intermediates; nothing here ever divides paise as
 *   a floating-point number.
 * - Composes, never recomputes: Essential Burn and Reserve Value stay each
 *   feature's own source of truth.
 */

export interface SafetyEvaluatorInput {
  readonly asOf: Date;
  readonly computedAt: Date;
  readonly sourceThrough: Date;
  readonly essentialBurn: EssentialBurnResponse;
  readonly reserves: ReserveSummary;
  readonly protectionState: ProtectionState;
  readonly financialProfileState: FinancialProfileState;
  readonly activeDebtCount: number;
  readonly highCostDebtCount: number;
  readonly safetyBufferState: SafetyBufferState;
}

export interface SafetyEvaluatorResult {
  readonly asOf: Date;
  readonly computedAt: Date;
  readonly sourceThrough: Date;
  readonly formulaVersion: number;
  readonly policyVersion: number;
  readonly quality: SafetyEvaluationQuality;
  readonly currentStage: SafetyStage;
  readonly nextAction: SafetyActionKey;
  readonly runway: SafetyRunway;
  readonly target: SafetyTarget;
  readonly checks: readonly SafetyCheck[];
  readonly limitations: readonly string[];
  readonly essentialBurnEvidence: SafetyEssentialBurnEvidence;
  readonly reserveEvidence: SafetyReserveEvidence;
  readonly protectionEvidence: SafetyProtectionEvidence;
  readonly debtEvidence: SafetyDebtEvidence;
}

function emptyEvidence(overrides: Partial<SafetyCheckEvidence> = {}): SafetyCheckEvidence {
  return {
    observedCount: null,
    requiredCount: null,
    coverageMinor: null,
    benchmarkMinor: null,
    ratioBps: null,
    activeDebtCount: null,
    highCostDebtCount: null,
    ...overrides
  };
}

function buildCheck(
  key: SafetyCheckKey,
  stage: SafetyStage,
  status: SafetyCheckStatus,
  attention: FinancialAttentionLevel,
  summaryKey: string,
  evidence: SafetyCheckEvidence,
  limitationKeys: readonly string[],
  action: SafetyActionKey | null
): SafetyCheck {
  return SafetyCheckSchema.parse({
    key,
    stage,
    status,
    attention,
    summaryKey,
    evidence,
    limitationKeys,
    action
  });
}

/** floor(numerator / denominator) via BigInt, converted back to a safe integer. */
function safeFloorDiv(numeratorMinor: bigint, denominatorMinor: bigint): number {
  return parseSafeIntegerMinor(numeratorMinor / denominatorMinor);
}

function resolveIncomeBasis(financialProfileState: FinancialProfileState): {
  basis: SafetyIncomeBasis;
  quality: SafetyIncomeBasisQuality;
  annualIncomeMinor: number | null;
} {
  const version = financialProfileState.currentSalaryVersion;
  if (version === null) {
    return { basis: "unknown", quality: "unavailable", annualIncomeMinor: null };
  }
  if (version.annualCtcMinor !== null) {
    return { basis: "annual_ctc", quality: "confirmed", annualIncomeMinor: version.annualCtcMinor };
  }
  const annualizedNetMinor = safeFloorDiv(BigInt(version.netMonthlySalaryMinor) * 12n, 1n);
  return {
    basis: "annualized_net_income",
    quality: "estimated",
    annualIncomeMinor: annualizedNetMinor
  };
}

function evaluateTermCheck(
  protectionState: ProtectionState,
  termBenchmarkMinor: number | null,
  incomeBasisQuality: SafetyIncomeBasisQuality,
  limitations: Set<string>
): SafetyCheck {
  const snapshot = protectionState.currentSnapshot;
  const termCover = protectionState.termCover;
  const key: SafetyCheckKey = "term_protection";
  const stage: SafetyStage = "ground_zero";

  if (!protectionState.configured || snapshot === null) {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "blocking",
      "term_protection.not_configured",
      emptyEvidence(),
      ["term_protection.not_configured"],
      "configure_protection"
    );
  }

  if (snapshot.termCoverStatus === "not_applicable") {
    return buildCheck(
      key,
      stage,
      "not_applicable",
      "none",
      "term_protection.not_applicable",
      emptyEvidence(),
      [],
      null
    );
  }

  if (snapshot.termCoverStatus === "none") {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "blocking",
      "term_protection.none_declared",
      emptyEvidence(),
      ["term_protection.none_declared"],
      "configure_protection"
    );
  }

  if (snapshot.termCoverStatus === "not_sure") {
    return buildCheck(
      key,
      stage,
      "unknown",
      "warning",
      "term_protection.unknown",
      emptyEvidence(),
      ["term_protection.unknown"],
      "configure_protection"
    );
  }

  if (snapshot.termCoverStatus === "employer_only") {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "blocking",
      "term_protection.employer_only",
      emptyEvidence(),
      ["term_protection.employer_only"],
      "configure_protection"
    );
  }

  // independent or both: the independent amount is what Ground Zero requires.
  if (snapshot.independentTermCoverMinor === null) {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "blocking",
      "term_protection.amount_missing",
      emptyEvidence(),
      ["term_protection.amount_missing"],
      "configure_protection"
    );
  }

  if (termCover.expiryState === "expired") {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "blocking",
      "term_protection.expired",
      emptyEvidence({ coverageMinor: snapshot.independentTermCoverMinor }),
      ["term_protection.expired"],
      "configure_protection"
    );
  }

  if (termBenchmarkMinor === null) {
    limitations.add("protection.income_basis_unknown");
    return buildCheck(
      key,
      stage,
      "unknown",
      "warning",
      "term_protection.income_basis_unknown",
      emptyEvidence({ coverageMinor: snapshot.independentTermCoverMinor }),
      ["protection.income_basis_unknown"],
      "configure_salary"
    );
  }

  if (incomeBasisQuality === "estimated") {
    limitations.add("protection.term_cover_uses_net_income_basis");
  }

  const ratioBps =
    termBenchmarkMinor === 0
      ? null
      : safeFloorDiv(
          BigInt(snapshot.independentTermCoverMinor) * 10_000n,
          BigInt(termBenchmarkMinor)
        );
  const passes = snapshot.independentTermCoverMinor >= termBenchmarkMinor;
  const evidence = emptyEvidence({
    coverageMinor: snapshot.independentTermCoverMinor,
    benchmarkMinor: termBenchmarkMinor,
    ratioBps
  });

  if (!passes) {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "warning",
      "term_protection.below_minimum",
      evidence,
      ["term_protection.below_minimum"],
      "configure_protection"
    );
  }

  if (termCover.expiryState === "expiring") {
    limitations.add("protection.term_cover_expiring_soon");
    return buildCheck(
      key,
      stage,
      "complete",
      "warning",
      "term_protection.expiring_soon",
      evidence,
      ["protection.term_cover_expiring_soon"],
      "configure_protection"
    );
  }

  return buildCheck(key, stage, "complete", "none", "term_protection.complete", evidence, [], null);
}

function evaluateHealthCheck(
  protectionState: ProtectionState,
  limitations: Set<string>
): SafetyCheck {
  const snapshot = protectionState.currentSnapshot;
  const healthCover = protectionState.healthCover;
  const key: SafetyCheckKey = "health_protection";
  const stage: SafetyStage = "ground_zero";
  const benchmarkMinor = SAFETY_POLICY.minHealthCoverMinor;

  if (!protectionState.configured || snapshot === null) {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "blocking",
      "health_protection.not_configured",
      emptyEvidence({ benchmarkMinor }),
      ["health_protection.not_configured"],
      "configure_protection"
    );
  }

  if (snapshot.healthCoverStatus === "none") {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "blocking",
      "health_protection.none_declared",
      emptyEvidence({ benchmarkMinor }),
      ["health_protection.none_declared"],
      "configure_protection"
    );
  }

  if (snapshot.healthCoverStatus === "not_sure") {
    return buildCheck(
      key,
      stage,
      "unknown",
      "warning",
      "health_protection.unknown",
      emptyEvidence({ benchmarkMinor }),
      ["health_protection.unknown"],
      "configure_protection"
    );
  }

  if (snapshot.healthCoverStatus === "employer_only") {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "blocking",
      "health_protection.employer_only",
      emptyEvidence({ benchmarkMinor }),
      ["health_protection.employer_only"],
      "configure_protection"
    );
  }

  if (snapshot.independentHealthBaseCoverMinor === null) {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "blocking",
      "health_protection.amount_missing",
      emptyEvidence({ benchmarkMinor }),
      ["health_protection.amount_missing"],
      "configure_protection"
    );
  }

  if (healthCover.expiryState === "expired") {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "blocking",
      "health_protection.expired",
      emptyEvidence({
        benchmarkMinor,
        coverageMinor: snapshot.independentHealthBaseCoverMinor
      }),
      ["health_protection.expired"],
      "configure_protection"
    );
  }

  const combinedMinor = parseSafeIntegerMinor(
    BigInt(snapshot.independentHealthBaseCoverMinor) +
      BigInt(snapshot.independentHealthSuperTopUpMinor ?? 0)
  );
  const ratioBps = safeFloorDiv(BigInt(combinedMinor) * 10_000n, BigInt(benchmarkMinor));
  const passes = combinedMinor >= benchmarkMinor;
  const evidence = emptyEvidence({ coverageMinor: combinedMinor, benchmarkMinor, ratioBps });

  if (!passes) {
    return buildCheck(
      key,
      stage,
      "incomplete",
      "warning",
      "health_protection.below_minimum",
      evidence,
      ["health_protection.below_minimum"],
      "configure_protection"
    );
  }

  if (healthCover.expiryState === "expiring") {
    limitations.add("protection.health_cover_expiring_soon");
    return buildCheck(
      key,
      stage,
      "complete",
      "warning",
      "health_protection.expiring_soon",
      evidence,
      ["protection.health_cover_expiring_soon"],
      "configure_protection"
    );
  }

  return buildCheck(
    key,
    stage,
    "complete",
    "none",
    "health_protection.complete",
    evidence,
    [],
    null
  );
}

function evaluateDebtCheck(activeDebtCount: number, highCostDebtCount: number): SafetyCheck {
  const evidence = emptyEvidence({ activeDebtCount, highCostDebtCount });
  if (highCostDebtCount > 0) {
    return buildCheck(
      "high_cost_debt",
      "ground_zero",
      "incomplete",
      "blocking",
      "high_cost_debt.present",
      evidence,
      ["high_cost_debt.present"],
      "review_debts"
    );
  }
  return buildCheck(
    "high_cost_debt",
    "ground_zero",
    "complete",
    "none",
    "high_cost_debt.none",
    evidence,
    [],
    null
  );
}

function evaluateEssentialBurnCheck(
  essentialBurn: EssentialBurnResponse,
  limitations: Set<string>
): SafetyCheck {
  const evidence = emptyEvidence({
    observedCount: essentialBurn.observedCompleteMonthCount,
    requiredCount: essentialBurn.requiredCompleteMonths
  });
  const hasCategorizationIssues =
    essentialBurn.classification.uncategorizedExpenseCount > 0 ||
    essentialBurn.classification.ungroupedExpenseCount > 0;

  if (essentialBurn.quality === "unavailable") {
    limitations.add("essential_burn.unavailable");
    return buildCheck(
      "essential_burn",
      "building_fortress",
      "incomplete",
      "warning",
      "essential_burn.unavailable",
      evidence,
      ["essential_burn.unavailable"],
      "review_transactions"
    );
  }

  if (essentialBurn.quality === "limited") {
    limitations.add("essential_burn.limited");
    if (hasCategorizationIssues) {
      limitations.add("essential_burn.uncategorized_or_ungrouped_present");
    }
    return buildCheck(
      "essential_burn",
      "building_fortress",
      "warning",
      "warning",
      "essential_burn.limited",
      evidence,
      ["essential_burn.limited"],
      hasCategorizationIssues ? "review_categories" : "review_transactions"
    );
  }

  if (hasCategorizationIssues) {
    limitations.add("essential_burn.uncategorized_or_ungrouped_present");
    return buildCheck(
      "essential_burn",
      "building_fortress",
      "complete",
      "warning",
      "essential_burn.complete_with_uncategorized",
      evidence,
      ["essential_burn.uncategorized_or_ungrouped_present"],
      "review_categories"
    );
  }

  return buildCheck(
    "essential_burn",
    "building_fortress",
    "complete",
    "none",
    "essential_burn.complete",
    evidence,
    [],
    null
  );
}

function evaluateReserveCheck(reserves: ReserveSummary, limitations: Set<string>): SafetyCheck {
  const evidence = emptyEvidence({
    observedCount: reserves.currentlyEligibleSourceCount,
    activeDebtCount: null
  });
  const hasStaleOrMissing =
    reserves.limitations.includes("stale_valuations_present") ||
    reserves.limitations.includes("missing_valuations_present");

  if (reserves.currentlyEligibleSourceCount === 0) {
    if (reserves.configuredSourceCount > 0) {
      limitations.add("reserve.configured_but_none_eligible");
      return buildCheck(
        "emergency_reserves",
        "building_fortress",
        "warning",
        "warning",
        "emergency_reserves.configured_but_none_eligible",
        evidence,
        ["reserve.configured_but_none_eligible"],
        "configure_reserves"
      );
    }
    return buildCheck(
      "emergency_reserves",
      "building_fortress",
      "incomplete",
      "blocking",
      "emergency_reserves.not_configured",
      evidence,
      ["reserve.not_configured"],
      "configure_reserves"
    );
  }

  if (hasStaleOrMissing) {
    if (reserves.limitations.includes("missing_valuations_present")) {
      limitations.add("reserve.missing_valuations_present");
    }
    if (reserves.limitations.includes("stale_valuations_present")) {
      limitations.add("reserve.stale_valuations_present");
    }
    return buildCheck(
      "emergency_reserves",
      "building_fortress",
      "complete",
      "warning",
      "emergency_reserves.stale_or_missing_present",
      evidence,
      ["reserve.stale_or_missing_present"],
      "refresh_asset_valuations"
    );
  }

  return buildCheck(
    "emergency_reserves",
    "building_fortress",
    "complete",
    "none",
    "emergency_reserves.complete",
    evidence,
    [],
    null
  );
}

function evaluateRunwayCheck(runway: SafetyRunway, meetsEffectiveTarget: boolean): SafetyCheck {
  const evidence = emptyEvidence();
  if (runway.availability === "unavailable") {
    return buildCheck(
      "emergency_runway",
      "building_fortress",
      "incomplete",
      "warning",
      "emergency_runway.unavailable",
      evidence,
      ["emergency_runway.unavailable"],
      null
    );
  }
  if (meetsEffectiveTarget) {
    return buildCheck(
      "emergency_runway",
      "building_fortress",
      "complete",
      "none",
      "emergency_runway.target_met",
      evidence,
      [],
      null
    );
  }
  return buildCheck(
    "emergency_runway",
    "building_fortress",
    "incomplete",
    "information",
    "emergency_runway.below_target",
    evidence,
    [],
    null
  );
}

function buildSinkingFundCheck(limitations: Set<string>): SafetyCheck {
  limitations.add("sinking_fund.taxonomy_unavailable");
  return buildCheck(
    "sinking_fund_buffer",
    "buffer_layer",
    "not_assessable",
    "information",
    "sinking_fund_buffer.not_assessable",
    emptyEvidence(),
    ["sinking_fund.taxonomy_unavailable"],
    "none"
  );
}

function resolveRunway(
  essentialBurn: EssentialBurnResponse,
  reserves: ReserveSummary
): SafetyRunway {
  const essentialBurnMinor = essentialBurn.averageMonthlyEssentialMinor;
  const eligibleReserveMinor = reserves.totalEligibleMinor;

  const unavailableReason =
    essentialBurnMinor === null
      ? ("essential_burn_unavailable" as const)
      : essentialBurnMinor === 0
        ? ("essential_burn_zero" as const)
        : reserves.currentlyEligibleSourceCount === 0
          ? ("no_eligible_reserve_source" as const)
          : eligibleReserveMinor === 0
            ? ("eligible_reserve_zero" as const)
            : null;

  if (unavailableReason !== null || essentialBurnMinor === null || essentialBurnMinor === 0) {
    return SafetyRunwaySchema.parse({
      availability: "unavailable",
      unavailableReason,
      tier: "unavailable",
      runwayBasisPoints: null,
      runwayDays: null,
      eligibleReserveMinor,
      essentialBurnMinor,
      observedCompleteMonthCount: essentialBurn.observedCompleteMonthCount,
      policyDaysPerMonth: SAFETY_POLICY.daysPerMonth,
      criticalThresholdBasisPoints: SAFETY_POLICY.runwayCriticalThresholdBasisPoints,
      fortifiedThresholdBasisPoints: SAFETY_POLICY.runwayFortifiedThresholdBasisPoints
    });
  }

  const runwayBasisPoints = safeFloorDiv(
    BigInt(eligibleReserveMinor) * 10_000n,
    BigInt(essentialBurnMinor)
  );
  const runwayDays = safeFloorDiv(
    BigInt(eligibleReserveMinor) * BigInt(SAFETY_POLICY.daysPerMonth),
    BigInt(essentialBurnMinor)
  );
  const tier =
    runwayBasisPoints < SAFETY_POLICY.runwayCriticalThresholdBasisPoints
      ? ("critical" as const)
      : runwayBasisPoints < SAFETY_POLICY.runwayFortifiedThresholdBasisPoints
        ? ("healthy" as const)
        : ("fortified" as const);

  return SafetyRunwaySchema.parse({
    availability: "available",
    unavailableReason: null,
    tier,
    runwayBasisPoints,
    runwayDays,
    eligibleReserveMinor,
    essentialBurnMinor,
    observedCompleteMonthCount: essentialBurn.observedCompleteMonthCount,
    policyDaysPerMonth: SAFETY_POLICY.daysPerMonth,
    criticalThresholdBasisPoints: SAFETY_POLICY.runwayCriticalThresholdBasisPoints,
    fortifiedThresholdBasisPoints: SAFETY_POLICY.runwayFortifiedThresholdBasisPoints
  });
}

function resolveTarget(
  essentialBurn: EssentialBurnResponse,
  reserves: ReserveSummary,
  safetyBufferState: SafetyBufferState
): SafetyTarget {
  const essentialBurnMinor = essentialBurn.averageMonthlyEssentialMinor ?? 0;
  const policyTargetMinor = parseSafeIntegerMinor(
    BigInt(essentialBurnMinor) * BigInt(SAFETY_POLICY.fortressTargetMonths)
  );
  const userTargetMinor = safetyBufferState.isFallback ? null : safetyBufferState.targetMinor;
  const effectiveTargetMinor =
    userTargetMinor !== null && userTargetMinor > policyTargetMinor
      ? userTargetMinor
      : policyTargetMinor;
  const targetSource =
    userTargetMinor !== null && userTargetMinor > policyTargetMinor
      ? ("user_preference" as const)
      : ("policy" as const);
  const targetMonths =
    targetSource === "policy"
      ? SAFETY_POLICY.fortressTargetMonths
      : safetyBufferState.preference?.mode === "essential_months"
        ? (safetyBufferState.preference.months ?? null)
        : null;

  const eligibleReserveMinor = reserves.totalEligibleMinor;
  const currentGapMinor =
    eligibleReserveMinor >= effectiveTargetMinor ? 0 : effectiveTargetMinor - eligibleReserveMinor;
  const currentSurplusMinor =
    eligibleReserveMinor > effectiveTargetMinor ? eligibleReserveMinor - effectiveTargetMinor : 0;

  return SafetyTargetSchema.parse({
    policyTargetMinor,
    userTargetMinor,
    effectiveTargetMinor,
    targetSource,
    targetMonths,
    currentGapMinor,
    currentSurplusMinor
  });
}

function resolveStage(
  groundZeroPassed: boolean,
  runway: SafetyRunway,
  meetsEffectiveTarget: boolean
): SafetyStage {
  if (!groundZeroPassed) return "ground_zero";
  // Building Fortress requires runway to be *available*, not merely "not
  // meeting target" -- an unavailable runway cannot be claimed as in-progress
  // fortress-building, so it stays at ground_zero until it can be calculated.
  if (runway.availability === "unavailable") return "ground_zero";
  return meetsEffectiveTarget ? "buffer_layer" : "building_fortress";
}

function resolveNextAction(
  incomeBasisQuality: SafetyIncomeBasisQuality,
  termCheck: SafetyCheck,
  healthCheck: SafetyCheck,
  debtCheck: SafetyCheck,
  essentialBurnCheck: SafetyCheck,
  reserveCheck: SafetyCheck,
  meetsEffectiveTarget: boolean,
  hasExplicitTargetPreference: boolean
): SafetyActionKey {
  if (incomeBasisQuality === "unavailable") return "configure_salary";
  if (termCheck.status === "incomplete" || termCheck.status === "unknown")
    return "configure_protection";
  if (healthCheck.status === "incomplete" || healthCheck.status === "unknown") {
    return "configure_protection";
  }
  if (debtCheck.status === "incomplete") return "review_debts";
  if (essentialBurnCheck.status === "incomplete") {
    return essentialBurnCheck.action ?? "review_transactions";
  }
  if (essentialBurnCheck.status === "warning") {
    return essentialBurnCheck.action ?? "review_transactions";
  }
  if (reserveCheck.status !== "complete") return reserveCheck.action ?? "configure_reserves";
  if (reserveCheck.action === "refresh_asset_valuations") return "refresh_asset_valuations";
  if (!meetsEffectiveTarget && !hasExplicitTargetPreference) return "configure_safety_buffer";
  return "none";
}

export function evaluateSafety(input: SafetyEvaluatorInput): SafetyEvaluatorResult {
  const limitations = new Set<string>();

  const incomeBasis = resolveIncomeBasis(input.financialProfileState);
  const termBenchmarkMinor =
    incomeBasis.annualIncomeMinor === null
      ? null
      : parseSafeIntegerMinor(
          BigInt(incomeBasis.annualIncomeMinor) * BigInt(SAFETY_POLICY.minTermCoverIncomeMultiple)
        );

  const termCheck = evaluateTermCheck(
    input.protectionState,
    termBenchmarkMinor,
    incomeBasis.quality,
    limitations
  );
  const healthCheck = evaluateHealthCheck(input.protectionState, limitations);
  const debtCheck = evaluateDebtCheck(input.activeDebtCount, input.highCostDebtCount);
  const essentialBurnCheck = evaluateEssentialBurnCheck(input.essentialBurn, limitations);
  const reserveCheck = evaluateReserveCheck(input.reserves, limitations);

  const runway = resolveRunway(input.essentialBurn, input.reserves);
  const target = resolveTarget(input.essentialBurn, input.reserves, input.safetyBufferState);
  // Gate on runway availability: when essential burn is missing, resolveTarget's
  // policyTargetMinor falls back to 0, which would otherwise make any
  // non-negative reserve trivially "meet" a target we can't actually compute.
  const meetsEffectiveTarget =
    runway.availability === "available" &&
    input.reserves.totalEligibleMinor >= target.effectiveTargetMinor;
  const runwayCheck = evaluateRunwayCheck(runway, meetsEffectiveTarget);
  const sinkingFundCheck = buildSinkingFundCheck(limitations);

  const groundZeroPassed =
    (termCheck.status === "complete" || termCheck.status === "not_applicable") &&
    healthCheck.status === "complete" &&
    debtCheck.status === "complete";

  const currentStage = resolveStage(groundZeroPassed, runway, meetsEffectiveTarget);

  const nextAction = resolveNextAction(
    incomeBasis.quality,
    termCheck,
    healthCheck,
    debtCheck,
    essentialBurnCheck,
    reserveCheck,
    meetsEffectiveTarget,
    !input.safetyBufferState.isFallback
  );

  const checks = [
    termCheck,
    healthCheck,
    debtCheck,
    essentialBurnCheck,
    reserveCheck,
    runwayCheck,
    sinkingFundCheck
  ];

  const quality: SafetyEvaluationQuality = limitations.size > 0 ? "limited" : "complete";

  return {
    asOf: input.asOf,
    computedAt: input.computedAt,
    sourceThrough: input.sourceThrough,
    formulaVersion: SAFETY_POLICY.formulaVersion,
    policyVersion: SAFETY_POLICY.policyVersion,
    quality,
    currentStage,
    nextAction,
    runway,
    target,
    checks,
    limitations: [...limitations].sort(),
    essentialBurnEvidence: {
      averageMonthlyEssentialMinor: input.essentialBurn.averageMonthlyEssentialMinor,
      observedCompleteMonthCount: input.essentialBurn.observedCompleteMonthCount,
      quality: input.essentialBurn.quality
    },
    reserveEvidence: {
      totalEligibleMinor: input.reserves.totalEligibleMinor,
      instantMinor: input.reserves.instantMinor,
      tPlusOneMinor: input.reserves.tPlusOneMinor,
      lockedMinor: input.reserves.lockedMinor,
      staleExcludedMinor: input.reserves.staleExcludedMinor,
      currentlyEligibleSourceCount: input.reserves.currentlyEligibleSourceCount,
      configuredSourceCount: input.reserves.configuredSourceCount
    },
    protectionEvidence: {
      termCoverState: input.protectionState.termCover.state,
      healthCoverState: input.protectionState.healthCover.state,
      incomeBasis: incomeBasis.basis,
      incomeBasisQuality: incomeBasis.quality,
      termBenchmarkMinor,
      healthBenchmarkMinor: SAFETY_POLICY.minHealthCoverMinor
    },
    debtEvidence: {
      activeDebtCount: input.activeDebtCount,
      highCostDebtCount: input.highCostDebtCount
    }
  };
}
