import {
  parseSafeIntegerMinor,
  RESERVE_FORMULA_VERSION,
  RESERVE_POLICY_VERSION,
  RESERVE_TIMEZONE,
  ReserveSourceSchema,
  ReserveSummarySchema,
  type ReserveLimitationKey,
  type ReserveSource,
  type ReserveSourceConfiguration,
  type ReserveSourceEligibility,
  type ReserveSourceExclusionReason,
  type ReserveSourceKind,
  type ReserveSourceType,
  type ReserveSummary,
  type ReserveValueFreshness
} from "@treasury-ops/shared";

/**
 * Pure, deterministic reserve-value evaluator (Formula Version 1).
 *
 * Rules:
 * - No NestJS, Drizzle, HTTP, or React imports -- callers gather every fact
 *   (account balances, asset valuations, freshness thresholds, stored
 *   classification) before calling in.
 * - Never mutates or re-derives an account balance or asset valuation; it
 *   only reads the values it was given.
 * - eligibleMinor = min(max(currentValueMinor, 0), configuredCapMinor ?? currentValueMinor),
 *   then policy exclusions (structural type, archived/closed, not configured,
 *   user-excluded, locked tier, missing/stale valuation, non-positive value)
 *   are applied on top, in a fixed precedence order so the result is
 *   reproducible from the same inputs.
 * - Locked and otherwise-excluded sources always contribute 0 to
 *   `eligibleMinor` -- they never enter instant/T+1/total eligible totals.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FRESHNESS_THRESHOLD_DAYS = 180;

export interface ReserveCandidateFact {
  readonly sourceKind: ReserveSourceKind;
  readonly sourceId: string;
  readonly displayName: string;
  readonly sourceType: ReserveSourceType;
  /** Archived account or closed asset. */
  readonly isUnavailable: boolean;
  /**
   * The canonical current value: `accounts.balanceMinor` for an account, or
   * the latest valuation at-or-before `asOf` for an asset. `null` only ever
   * occurs for an asset with no valuation on or before `asOf`.
   */
  readonly currentValueMinor: number | null;
  /** Asset valuation timestamp; always `null` for an account. */
  readonly valuedAt: Date | null;
  /** Asset valuation freshness threshold in days; always `null` for an account. */
  readonly freshnessThresholdDays: number | null;
  readonly lastUpdatedAt: Date | null;
  /** The current active classification, or `null` if this source is an unconfigured candidate. */
  readonly configuration: ReserveSourceConfiguration | null;
}

export interface EvaluateReserveSourcesInput {
  readonly candidates: readonly ReserveCandidateFact[];
  readonly asOf: Date;
  readonly computedAt?: Date;
}

export interface EvaluateReserveSourcesResult {
  readonly sources: readonly ReserveSource[];
  readonly summary: ReserveSummary;
}

function structuralExclusion(
  sourceKind: ReserveSourceKind,
  sourceType: ReserveSourceType
): ReserveSourceExclusionReason | null {
  if (sourceKind === "account") {
    if (sourceType === "credit_card") return "unsupported_account_type";
    // Investment accounts are treated conservatively in V1 to avoid double
    // counting with individually-classified investment assets -- see
    // docs/features/02-safety-ladder-runway/02-emergency-reserve-sources/backend.md.
    if (sourceType === "investment") return "potential_double_count";
    return null;
  }
  if (sourceType === "loan_liability" || sourceType === "loan_receivable") {
    return "unsupported_asset_kind";
  }
  return null;
}

function computeFreshness(candidate: ReserveCandidateFact, asOf: Date): ReserveValueFreshness {
  if (candidate.sourceKind === "account") return "not_applicable";
  if (candidate.valuedAt === null || candidate.currentValueMinor === null) return "missing";
  const ageDays = Math.floor((asOf.getTime() - candidate.valuedAt.getTime()) / ONE_DAY_MS);
  const thresholdDays = candidate.freshnessThresholdDays ?? DEFAULT_FRESHNESS_THRESHOLD_DAYS;
  return ageDays > thresholdDays ? "stale" : "fresh";
}

function buildResult(
  candidate: ReserveCandidateFact,
  freshness: ReserveValueFreshness,
  exclusionReason: ReserveSourceExclusionReason,
  eligibleMinor: number
): ReserveSource {
  const eligibility: ReserveSourceEligibility =
    exclusionReason === "none" ? "eligible" : "ineligible";

  return ReserveSourceSchema.parse({
    sourceKind: candidate.sourceKind,
    sourceId: candidate.sourceId,
    displayName: candidate.displayName,
    sourceType: candidate.sourceType,
    configuration: candidate.configuration,
    currentValueMinor: candidate.currentValueMinor,
    valuedAt: candidate.valuedAt,
    freshness,
    eligibleMinor,
    eligibility,
    exclusionReason,
    isUnavailable: candidate.isUnavailable,
    lastUpdatedAt: candidate.lastUpdatedAt
  });
}

/**
 * Evaluates one candidate source. Exclusion precedence (first match wins):
 * 1. Structural type (credit card, investment account, loan asset)
 * 2. Archived account / closed asset
 * 3. Not configured
 * 4. User-excluded (isIncluded = false)
 * 5. Locked tier
 * 6. Missing valuation (asset)
 * 7. Stale valuation (asset)
 * 8. Non-positive current value
 * 9. Cap results in zero (defensive; unreachable via the public API since a
 *    cap must be a positive integer, kept for schema/contract completeness)
 * 10. Eligible
 *
 * `freshness` is always computed independently of this precedence so a
 * locked or archived asset's valuation age is still visible to the caller.
 */
export function evaluateReserveCandidate(
  candidate: ReserveCandidateFact,
  asOf: Date
): ReserveSource {
  const freshness = computeFreshness(candidate, asOf);

  const structural = structuralExclusion(candidate.sourceKind, candidate.sourceType);
  if (structural !== null) {
    return buildResult(candidate, freshness, structural, 0);
  }

  if (candidate.isUnavailable) {
    const reason: ReserveSourceExclusionReason =
      candidate.sourceKind === "account" ? "archived_account" : "closed_asset";
    return buildResult(candidate, freshness, reason, 0);
  }

  if (candidate.configuration === null) {
    return buildResult(candidate, freshness, "not_configured", 0);
  }

  if (!candidate.configuration.isIncluded) {
    return buildResult(candidate, freshness, "user_excluded", 0);
  }

  if (candidate.configuration.liquidityTier === "locked") {
    return buildResult(candidate, freshness, "locked", 0);
  }

  if (candidate.sourceKind === "asset" && candidate.currentValueMinor === null) {
    return buildResult(candidate, freshness, "missing_valuation", 0);
  }

  if (freshness === "stale") {
    return buildResult(candidate, freshness, "stale_valuation", 0);
  }

  const currentValueMinor = candidate.currentValueMinor ?? 0;
  if (currentValueMinor <= 0) {
    return buildResult(candidate, freshness, "non_positive_value", 0);
  }

  const cap = candidate.configuration.eligibleCapMinor;
  const eligibleMinor = Math.min(currentValueMinor, cap ?? currentValueMinor);
  if (eligibleMinor <= 0) {
    return buildResult(candidate, freshness, "cap_results_in_zero", 0);
  }

  return buildResult(candidate, freshness, "none", eligibleMinor);
}

/** The value that would count for a source if its exclusion reason did not exclude it -- used only for informational `lockedMinor`/`staleExcludedMinor` aggregate display, never for `eligibleMinor` on the source itself. */
function referenceValueMinor(source: ReserveSource): number {
  if (source.currentValueMinor === null || source.currentValueMinor <= 0) return 0;
  const cap = source.configuration?.eligibleCapMinor ?? null;
  return Math.min(source.currentValueMinor, cap ?? source.currentValueMinor);
}

/**
 * Evaluates every candidate and folds the results into the canonical
 * aggregate. Deterministic ordering: `sourceKind` then `sourceId`.
 */
export function evaluateReserveSources(
  input: EvaluateReserveSourcesInput
): EvaluateReserveSourcesResult {
  const computedAt = input.computedAt ?? new Date();

  const sources = [...input.candidates]
    .map((candidate) => evaluateReserveCandidate(candidate, input.asOf))
    .sort((a, b) => {
      if (a.sourceKind !== b.sourceKind) return a.sourceKind.localeCompare(b.sourceKind);
      return a.sourceId.localeCompare(b.sourceId);
    });

  let instantMinor = 0n;
  let tPlusOneMinor = 0n;
  let lockedMinor = 0n;
  let staleExcludedMinor = 0n;
  let configuredSourceCount = 0;
  let currentlyEligibleSourceCount = 0;
  let missingValueSourceCount = 0;
  let staleSourceCount = 0;
  let excludedSourceCount = 0;
  let hasArchivedOrClosed = false;
  const limitations = new Set<ReserveLimitationKey>();

  for (const source of sources) {
    if (source.configuration !== null) configuredSourceCount += 1;

    if (source.eligibility === "eligible") {
      currentlyEligibleSourceCount += 1;
      if (source.configuration?.liquidityTier === "instant") {
        instantMinor += BigInt(source.eligibleMinor);
      } else if (source.configuration?.liquidityTier === "t_plus_1") {
        tPlusOneMinor += BigInt(source.eligibleMinor);
      }
    } else if (source.configuration !== null) {
      excludedSourceCount += 1;
    }

    if (source.freshness === "missing") missingValueSourceCount += 1;
    if (source.freshness === "stale") staleSourceCount += 1;

    if (source.exclusionReason === "locked") {
      lockedMinor += BigInt(referenceValueMinor(source));
      limitations.add("locked_sources_present");
    }

    if (source.exclusionReason === "stale_valuation") {
      staleExcludedMinor += BigInt(referenceValueMinor(source));
      limitations.add("stale_valuations_present");
    }

    if (source.exclusionReason === "missing_valuation") {
      limitations.add("missing_valuations_present");
    }

    if (
      source.exclusionReason === "archived_account" ||
      source.exclusionReason === "closed_asset"
    ) {
      hasArchivedOrClosed = true;
    }
  }

  if (hasArchivedOrClosed) limitations.add("archived_or_closed_sources_present");

  if (sources.length === 0) {
    limitations.add("no_candidates_available");
  } else if (configuredSourceCount === 0) {
    limitations.add("no_sources_configured");
  } else if (currentlyEligibleSourceCount === 0) {
    limitations.add("configured_but_none_eligible");
  }

  const totalEligibleMinor = instantMinor + tPlusOneMinor;

  const summary = ReserveSummarySchema.parse({
    computedAt,
    asOf: input.asOf,
    sourceThrough: computedAt,
    formulaVersion: RESERVE_FORMULA_VERSION,
    policyVersion: RESERVE_POLICY_VERSION,
    timezone: RESERVE_TIMEZONE,
    configuredSourceCount,
    currentlyEligibleSourceCount,
    instantMinor: parseSafeIntegerMinor(instantMinor),
    tPlusOneMinor: parseSafeIntegerMinor(tPlusOneMinor),
    totalEligibleMinor: parseSafeIntegerMinor(totalEligibleMinor),
    lockedMinor: parseSafeIntegerMinor(lockedMinor),
    staleExcludedMinor: parseSafeIntegerMinor(staleExcludedMinor),
    missingValueSourceCount,
    staleSourceCount,
    excludedSourceCount,
    limitations: [...limitations].sort()
  });

  return { sources, summary };
}
