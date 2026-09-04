import type {
  SafetyRunway,
  SafetyRunwayTier,
  SafetyRunwayUnavailableReason
} from "@treasury-ops/shared";

/**
 * @file Pure presentation helpers for the Runway Clock.
 *
 * No financial calculation lives here -- `runwayBasisPoints`/`runwayDays`
 * are already the backend's canonical integer result. This file only
 * formats that integer for display and converts it to a 0-1 geometry ratio
 * for the visual scale; it never divides paise or re-derives a tier.
 */

export interface RunwayTierCopy {
  readonly label: string;
  readonly headline: string;
  readonly description: string;
  readonly badgeVariant: "success" | "accent" | "problem";
}

const TIER_COPY: Readonly<Record<SafetyRunwayTier, RunwayTierCopy>> = {
  critical: {
    label: "Critical",
    headline: "Less than three months of essential runway.",
    description:
      "Your eligible reserves would not cover essential spending for three months without salary.",
    badgeVariant: "problem"
  },
  healthy: {
    label: "Healthy",
    headline: "Stable, with less than six months of essential runway.",
    description:
      "Your eligible reserves meet the three-month mark but not yet the six-month benchmark.",
    badgeVariant: "accent"
  },
  fortified: {
    label: "Fortified",
    headline: "Your six-month safety benchmark is met.",
    description:
      "Your eligible reserves cover at least six months of essential spending without salary.",
    badgeVariant: "success"
  },
  unavailable: {
    label: "Unavailable",
    headline: "Runway cannot be calculated yet.",
    description: "At least one required input is missing.",
    badgeVariant: "problem"
  }
};

export function getRunwayTierCopy(tier: SafetyRunwayTier): RunwayTierCopy {
  return TIER_COPY[tier];
}

const UNAVAILABLE_REASON_COPY: Readonly<Record<SafetyRunwayUnavailableReason, string>> = {
  essential_burn_unavailable:
    "Essential Burn has not been calculated yet -- record essential expenses to establish a baseline.",
  essential_burn_zero:
    "Your essential burn baseline is zero, so runway cannot be measured against it.",
  no_eligible_reserve_source:
    "No account or asset is currently classified as an eligible emergency reserve.",
  eligible_reserve_zero: "Your classified emergency reserves currently total zero."
};

export function getRunwayUnavailableCopy(reason: SafetyRunwayUnavailableReason | null): string {
  if (reason === null) return "Runway cannot be calculated yet.";
  return UNAVAILABLE_REASON_COPY[reason];
}

/**
 * Formats already-integer basis points as a one-decimal months string, e.g.
 * 45_000 -> "4.5". Never called with a value the backend didn't already
 * compute.
 */
export function formatRunwayMonths(runwayBasisPoints: number): string {
  const tenths = Math.round(runwayBasisPoints / 1_000);
  const whole = Math.floor(tenths / 10);
  const remainder = tenths % 10;
  return `${whole}.${remainder}`;
}

/**
 * 0-1 visual fill ratio for the clock/progress scale, capped at the
 * fortified threshold so a very large runway still reads as "full" rather
 * than overflowing the geometry -- the exact number stays in the text.
 */
export function runwayGeometryRatio(runway: SafetyRunway): number {
  if (runway.availability === "unavailable" || runway.runwayBasisPoints === null) return 0;
  return Math.min(1, runway.runwayBasisPoints / runway.fortifiedThresholdBasisPoints);
}

/** Fraction along the scale (0-1) where the critical/healthy threshold marker sits. */
export function criticalMarkerRatio(runway: SafetyRunway): number {
  return runway.criticalThresholdBasisPoints / runway.fortifiedThresholdBasisPoints;
}

export function formatRunwayDays(runwayDays: number): string {
  return runwayDays === 1 ? "1 day" : `${runwayDays} days`;
}

const LIMITATION_KEY_COPY: Readonly<Record<string, string>> = {
  "term_protection.not_configured": "Term life protection is not configured",
  "term_protection.none_declared": "No independent term cover is declared",
  "term_protection.employer_only": "Only employer-provided term cover is declared",
  "term_protection.amount_missing": "Term cover amount has not been recorded",
  "term_protection.expired": "The term life policy has expired",
  "term_protection.below_minimum": "Term cover is below the 10x annual income benchmark",
  "term_protection.expiring_soon": "Term cover is expiring within 90 days",
  "health_protection.not_configured": "Health protection is not configured",
  "health_protection.none_declared": "No independent health cover is declared",
  "health_protection.employer_only": "Only employer-provided health cover is declared",
  "health_protection.amount_missing": "Health cover amount has not been recorded",
  "health_protection.expired": "The health policy has expired",
  "health_protection.below_minimum": "Health cover is below the ₹15,00,000 benchmark",
  "health_protection.expiring_soon": "Health cover is expiring within 90 days",
  "debt.high_cost_present": "Active debts with interest rates above the high-cost threshold remain",
  "burn.unavailable": "Essential burn history is unavailable",
  "burn.limited": "Essential burn is based on limited expense history",
  "reserve.no_sources_configured": "No emergency reserve sources are configured",
  "reserve.configured_but_none_eligible":
    "Configured reserve sources exist, but none are currently eligible",
  "reserve.stale_or_missing_present": "Eligible reserves contain stale or missing valuations",
  "runway.essential_burn_unavailable": "Essential burn has not been calculated yet",
  "runway.essential_burn_zero": "Essential burn is zero",
  "runway.no_eligible_reserve_source": "No eligible emergency reserve sources are configured",
  "runway.eligible_reserve_zero": "Classified emergency reserves total zero",
  "runway.below_target": "Runway is below your target",
  "sinking_fund.not_assessable": "Sinking funds are not yet assessable",
  current_category_metadata_in_use: "Using current category metadata classification"
};

/** Formats a machine limitation key into an accessible, user-facing explanation. */
export function formatLimitationKey(key: string): string {
  const mapped = LIMITATION_KEY_COPY[key];
  if (mapped !== undefined) return mapped;
  const cleaned = key.replace(/[._]/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
