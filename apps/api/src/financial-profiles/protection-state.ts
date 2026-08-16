import {
  PROTECTION_EXPIRING_SOON_DAYS,
  ProtectionStateSchema,
  statusHasEmployerCover,
  statusHasIndependentCover,
  type ProtectionCoverageState,
  type ProtectionCoverageSummary,
  type ProtectionDataQuality,
  type ProtectionExpiryState,
  type ProtectionSnapshot,
  type ProtectionState
} from "@treasury-ops/shared";

import { istCalendarDateStartUtc } from "../common/time/ist.js";

/**
 * @file Pure derivation of the protection state the API returns.
 *
 * Two rules shape everything here:
 *
 * 1. Missing information never becomes a safe answer. "Not sure" and a claimed
 *    cover with no amount both surface as their own states with an explicit
 *    limitation, so nothing downstream can mistake silence for cover.
 * 2. This computes *states*, not advice. There is no adequacy ratio, no
 *    recommended sum assured, and no product suggestion — those belong to the
 *    safety ladder, which is out of scope for this feature.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1_000;

type CoverKind = "term" | "health";

type CoverFacts = Readonly<{
  status: string;
  independentAmountMinor: number | null;
  employerAmountMinor: number | null;
  expiresOn: Date | null;
}>;

/**
 * Whole Asia/Kolkata calendar days from `asOf` to `expiresOn`. Both instants
 * are anchored to the start of their IST calendar day first, so a policy
 * expiring "today" is 0 regardless of the time of day either value carries.
 */
export function istCalendarDaysUntil(expiresOn: Date, asOf: Date): number {
  const from = istCalendarDateStartUtc(asOf).getTime();
  const to = istCalendarDateStartUtc(expiresOn).getTime();
  return Math.round((to - from) / ONE_DAY_MS);
}

export function deriveExpiryState(expiresOn: Date | null, asOf: Date): ProtectionExpiryState {
  if (expiresOn === null) return "not_applicable";
  const days = istCalendarDaysUntil(expiresOn, asOf);
  if (days < 0) return "expired";
  return days <= PROTECTION_EXPIRING_SOON_DAYS ? "expiring" : "active";
}

function deriveCoverageState(facts: CoverFacts): ProtectionCoverageState {
  switch (facts.status) {
    case "not_applicable":
      return "not_applicable";
    case "not_sure":
      return "unknown";
    case "none":
      return "none_declared";
    case "employer_only":
      // Deliberately its own state rather than "complete": employer cover
      // usually ends with the employment, which the UI must be able to say.
      return "employer_only";
    case "independent":
      return facts.independentAmountMinor === null ? "incomplete" : "complete";
    case "both":
      return facts.independentAmountMinor === null || facts.employerAmountMinor === null
        ? "incomplete"
        : "complete";
    default:
      return "unknown";
  }
}

function summarize(facts: CoverFacts, asOf: Date): ProtectionCoverageSummary {
  return {
    state: deriveCoverageState(facts),
    expiryState: deriveExpiryState(facts.expiresOn, asOf),
    expiresOn: facts.expiresOn,
    hasIndependentCover: statusHasIndependentCover(facts.status),
    hasEmployerCover: statusHasEmployerCover(facts.status)
  };
}

const NOT_CONFIGURED: ProtectionCoverageSummary = {
  state: "not_configured",
  expiryState: "not_applicable",
  expiresOn: null,
  hasIndependentCover: false,
  hasEmployerCover: false
};

function coverLimitations(kind: CoverKind, summary: ProtectionCoverageSummary): readonly string[] {
  const label = kind === "term" ? "Term life cover" : "Health cover";
  const limitations: string[] = [];

  if (summary.state === "unknown") {
    limitations.push(`${label} is recorded as "not sure", so it is treated as unknown.`);
  }
  if (summary.state === "incomplete") {
    limitations.push(`${label} amount is not recorded, so the cover cannot be assessed.`);
  }
  if (summary.state === "employer_only") {
    limitations.push(`${label} is employer-provided only and may end with your employment.`);
  }
  if (summary.expiryState === "expired") {
    limitations.push(`Your independent ${kind} policy expiry date has passed.`);
  }
  if (summary.expiryState === "expiring") {
    limitations.push(
      `Your independent ${kind} policy expires within ${PROTECTION_EXPIRING_SOON_DAYS} days.`
    );
  }
  return limitations;
}

function deriveDataQuality(
  term: ProtectionCoverageSummary,
  health: ProtectionCoverageSummary
): ProtectionDataQuality {
  // An expired policy is checked first: the recorded fact no longer describes
  // reality, which is more actionable than an unanswered question.
  if (term.expiryState === "expired" || health.expiryState === "expired") return "stale";
  const states = [term.state, health.state];
  if (states.some((state) => state === "unknown" || state === "incomplete")) return "limited";
  return "complete";
}

/**
 * Builds the response for `GET /v1/financial-profile/protection`. With no
 * snapshot the answer is explicitly `not_configured` / `unavailable` — this
 * function has no branch that invents a reassuring default.
 */
export function deriveProtectionState(
  input: Readonly<{
    snapshot: ProtectionSnapshot | null;
    upcomingSnapshot: ProtectionSnapshot | null;
    asOf: Date;
  }>
): ProtectionState {
  const { snapshot, upcomingSnapshot, asOf } = input;

  if (snapshot === null) {
    return ProtectionStateSchema.parse({
      configured: false,
      currentSnapshot: null,
      upcomingSnapshot,
      asOf,
      dataQuality: "unavailable",
      termCover: NOT_CONFIGURED,
      healthCover: NOT_CONFIGURED,
      expiringSoonDays: PROTECTION_EXPIRING_SOON_DAYS,
      limitations: [
        "No protection answers recorded yet, so protection status is unknown rather than safe."
      ]
    });
  }

  const termCover = summarize(
    {
      status: snapshot.termCoverStatus,
      independentAmountMinor: snapshot.independentTermCoverMinor,
      employerAmountMinor: snapshot.employerTermCoverMinor,
      expiresOn: snapshot.independentTermExpiresOn
    },
    asOf
  );
  const healthCover = summarize(
    {
      status: snapshot.healthCoverStatus,
      // Base cover is what makes health cover assessable; a super top-up on its
      // own sits above a base that may not exist.
      independentAmountMinor: snapshot.independentHealthBaseCoverMinor,
      employerAmountMinor: snapshot.employerHealthCoverMinor,
      expiresOn: snapshot.independentHealthExpiresOn
    },
    asOf
  );

  const limitations = [
    ...coverLimitations("term", termCover),
    ...coverLimitations("health", healthCover)
  ];
  if (upcomingSnapshot !== null) {
    limitations.push("A future-dated protection snapshot exists and is not reflected above.");
  }

  return ProtectionStateSchema.parse({
    configured: true,
    currentSnapshot: snapshot,
    upcomingSnapshot,
    asOf,
    dataQuality: deriveDataQuality(termCover, healthCover),
    termCover,
    healthCover,
    expiringSoonDays: PROTECTION_EXPIRING_SOON_DAYS,
    limitations
  });
}
