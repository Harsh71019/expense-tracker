import {
  BudgetProgressSchema,
  type Budget,
  type BudgetCategory,
  type BudgetProgress,
  type BudgetProgressState
} from "@treasury-ops/shared";

/** Design doc §9: policy version 1 fires at 80% and 100%, never both at once. */
export const ALERT_POLICY_VERSION = 1;
export const ALERT_THRESHOLDS_BPS = [8_000, 10_000] as const;

/**
 * `spentMinor * 10_000` stays inside `Number.MAX_SAFE_INTEGER` at any paise
 * amount this app's money schemas allow, but the design doc (§4.3) asks for
 * bigint intermediate arithmetic rather than relying on that margin --
 * cheap insurance against a future safe-integer-bound change.
 */
export function computeUtilizationBps(spentMinor: number, limitMinor: number): number {
  return Number((BigInt(spentMinor) * 10_000n) / BigInt(limitMinor));
}

export function budgetProgressState(utilizationBps: number): BudgetProgressState {
  if (utilizationBps >= 10_000) return "reached";
  if (utilizationBps >= 8_000) return "approaching";
  return "under";
}

/**
 * An archived budget or a budget whose category has since been archived is
 * "ineffective" (design doc §7): it stops contributing to progress/alerts
 * without losing its configuration or alert history, so effective spend is
 * reported as zero rather than the real (now-irrelevant) figure.
 */
export function buildBudgetProgress(
  budget: Budget,
  category: BudgetCategory,
  spentMinorWhenEffective: number
): BudgetProgress {
  const isEffective = !budget.isArchived && !category.isArchived;
  const spentMinor = isEffective ? spentMinorWhenEffective : 0;
  const utilizationBps = isEffective ? computeUtilizationBps(spentMinor, budget.limitMinor) : 0;

  return BudgetProgressSchema.parse({
    budget,
    category,
    spentMinor,
    remainingMinor: budget.limitMinor - spentMinor,
    utilizationBps,
    state: budgetProgressState(utilizationBps),
    isEffective
  });
}
