import type {
  ReserveLiquidityTier,
  ReserveSource,
  ReserveSourceExclusionReason,
  ReserveValueFreshness
} from "@treasury-ops/shared";

/**
 * @file Pure presentation helpers for the emergency reserve source manager.
 * No calculation lives here -- every amount and eligibility state is read
 * straight off the backend-evaluated `ReserveSource`/`ReserveSummary`. This
 * file only groups, labels, and formats what the API already decided.
 */

export interface GroupedReserveSources {
  readonly instant: readonly ReserveSource[];
  readonly tPlusOne: readonly ReserveSource[];
  readonly lockedOrExcluded: readonly ReserveSource[];
  readonly availableUnconfigured: readonly ReserveSource[];
  readonly unavailableStaleOrMissing: readonly ReserveSource[];
}

const STRUCTURAL_UNSUPPORTED_REASONS = new Set<ReserveSourceExclusionReason>([
  "unsupported_account_type",
  "unsupported_asset_kind",
  "potential_double_count"
]);

/**
 * Groups sources for the manager's five sections. A source lands in exactly
 * one group -- precedence mirrors the backend evaluator's exclusion order,
 * so a stale/missing asset always shows in the freshness-warning group even
 * if it also happens to be otherwise well configured.
 */
export function groupReserveSources(sources: readonly ReserveSource[]): GroupedReserveSources {
  const instant: ReserveSource[] = [];
  const tPlusOne: ReserveSource[] = [];
  const lockedOrExcluded: ReserveSource[] = [];
  const availableUnconfigured: ReserveSource[] = [];
  const unavailableStaleOrMissing: ReserveSource[] = [];

  for (const source of sources) {
    if (source.eligibility === "eligible" && source.configuration?.liquidityTier === "instant") {
      instant.push(source);
    } else if (
      source.eligibility === "eligible" &&
      source.configuration?.liquidityTier === "t_plus_1"
    ) {
      tPlusOne.push(source);
    } else if (
      source.exclusionReason === "missing_valuation" ||
      source.exclusionReason === "stale_valuation"
    ) {
      unavailableStaleOrMissing.push(source);
    } else if (source.exclusionReason === "not_configured") {
      availableUnconfigured.push(source);
    } else {
      lockedOrExcluded.push(source);
    }
  }

  return { instant, tPlusOne, lockedOrExcluded, availableUnconfigured, unavailableStaleOrMissing };
}

export function isStructurallyUnsupported(reason: ReserveSourceExclusionReason): boolean {
  return STRUCTURAL_UNSUPPORTED_REASONS.has(reason);
}

export const LIQUIDITY_TIER_LABELS: Readonly<Record<ReserveLiquidityTier, string>> = {
  instant: "Instant access",
  t_plus_1: "T+1 access",
  locked: "Locked / excluded"
};

export const LIQUIDITY_TIER_DESCRIPTIONS: Readonly<Record<ReserveLiquidityTier, string>> = {
  instant: "Normally accessible the same day.",
  t_plus_1: "Normally accessible by the next business/settlement day.",
  locked: "Tracked for context, but excluded from eligible emergency reserves."
};

export function sourceTypeLabel(sourceType: string): string {
  return sourceType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export interface ExclusionCopy {
  readonly label: string;
  readonly tone: "neutral" | "warning" | "problem";
}

const EXCLUSION_COPY: Readonly<Record<ReserveSourceExclusionReason, ExclusionCopy>> = {
  none: { label: "Counted", tone: "neutral" },
  not_configured: { label: "Not configured", tone: "neutral" },
  user_excluded: { label: "Excluded by you", tone: "neutral" },
  locked: { label: "Locked — excluded from totals", tone: "neutral" },
  unsupported_account_type: { label: "This account type cannot be a reserve", tone: "neutral" },
  unsupported_asset_kind: { label: "This asset kind cannot be a reserve", tone: "neutral" },
  archived_account: { label: "Account is archived", tone: "warning" },
  closed_asset: { label: "Asset is closed", tone: "warning" },
  missing_valuation: { label: "No valuation on record", tone: "warning" },
  stale_valuation: { label: "Valuation is stale", tone: "warning" },
  non_positive_value: { label: "Current value is zero or negative", tone: "warning" },
  cap_results_in_zero: { label: "Configured cap results in zero", tone: "warning" },
  potential_double_count: {
    label: "Excluded to avoid double-counting with asset records",
    tone: "neutral"
  }
};

export function getExclusionCopy(reason: ReserveSourceExclusionReason): ExclusionCopy {
  return EXCLUSION_COPY[reason];
}

export function getFreshnessLabel(freshness: ReserveValueFreshness): string {
  switch (freshness) {
    case "fresh":
      return "Fresh";
    case "stale":
      return "Stale";
    case "missing":
      return "No valuation";
    case "not_applicable":
      return "";
  }
}

/** "Valued 12 days ago", using calendar-day rounding against `asOf`. */
export function formatValuationAge(valuedAt: Date | null, asOf: Date): string {
  if (valuedAt === null) return "No valuation recorded";
  const ageDays = Math.max(
    0,
    Math.floor((asOf.getTime() - valuedAt.getTime()) / (24 * 60 * 60 * 1000))
  );
  if (ageDays === 0) return "Valued today";
  if (ageDays === 1) return "Valued 1 day ago";
  return `Valued ${ageDays} days ago`;
}

/**
 * True when `sourceId` is the only currently-eligible source and the pending
 * change would remove it (exclude it, lock it, or cap it to nothing) -- used
 * to gate the last-eligible-source removal warning in the form sheet.
 */
export function isRemovingLastEligibleSource(
  sources: readonly ReserveSource[],
  sourceId: string,
  willRemainEligible: boolean
): boolean {
  if (willRemainEligible) return false;
  const eligible = sources.filter((source) => source.eligibility === "eligible");
  return eligible.length === 1 && eligible[0]?.sourceId === sourceId;
}
