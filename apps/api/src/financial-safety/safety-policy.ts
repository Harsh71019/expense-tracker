import {
  HIGH_COST_DEBT_ANNUAL_RATE_BPS,
  PROTECTION_EXPIRING_SOON_DAYS,
  SAFETY_FORMULA_VERSION,
  SAFETY_FORTRESS_TARGET_MONTHS,
  SAFETY_MIN_HEALTH_COVER_MINOR,
  SAFETY_MIN_TERM_COVER_INCOME_MULTIPLE,
  SAFETY_POLICY_DAYS_PER_MONTH,
  SAFETY_POLICY_VERSION,
  SAFETY_RUNWAY_CRITICAL_THRESHOLD_BASIS_POINTS,
  SAFETY_RUNWAY_FORTIFIED_THRESHOLD_BASIS_POINTS
} from "@treasury-ops/shared";

/**
 * Centralized Safety Evaluation policy (Policy Version 1).
 *
 * Reuses the existing high-cost debt threshold and protection expiring-soon
 * window rather than redeclaring them -- this module only adds the constants
 * that are new to the safety ladder/runway feature. No named product
 * guidance and no fractional score belong here or anywhere downstream of it.
 */
export const SAFETY_POLICY = {
  formulaVersion: SAFETY_FORMULA_VERSION,
  policyVersion: SAFETY_POLICY_VERSION,
  runwayCriticalThresholdBasisPoints: SAFETY_RUNWAY_CRITICAL_THRESHOLD_BASIS_POINTS,
  runwayFortifiedThresholdBasisPoints: SAFETY_RUNWAY_FORTIFIED_THRESHOLD_BASIS_POINTS,
  fortressTargetMonths: SAFETY_FORTRESS_TARGET_MONTHS,
  daysPerMonth: SAFETY_POLICY_DAYS_PER_MONTH,
  highCostDebtAnnualRateBps: HIGH_COST_DEBT_ANNUAL_RATE_BPS,
  minTermCoverIncomeMultiple: SAFETY_MIN_TERM_COVER_INCOME_MULTIPLE,
  minHealthCoverMinor: SAFETY_MIN_HEALTH_COVER_MINOR,
  protectionExpiringSoonDays: PROTECTION_EXPIRING_SOON_DAYS
} as const;
