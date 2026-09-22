import { createHash } from "node:crypto";
import type {
  EssentialBurnResponse,
  FinancialProfileState,
  ProtectionState,
  ReserveSummary,
  SafetyBufferState
} from "@treasury-ops/shared";

import { SAFETY_POLICY } from "./safety-policy.js";

/**
 * Deterministic input fingerprint for one Safety Evaluation.
 *
 * Only normalized, canonical evaluation inputs go in -- versions, quality
 * states, and bounded aggregates, never `computedAt`, never prose, never a
 * raw financial amount logged elsewhere. Canonical key ordering makes the
 * hash reproducible for identical facts and different for any relevant
 * change, including a policy/formula version bump.
 */
export interface SafetyFingerprintInput {
  readonly asOf: Date;
  readonly essentialBurn: EssentialBurnResponse;
  readonly reserves: ReserveSummary;
  readonly protectionState: ProtectionState;
  readonly financialProfileState: FinancialProfileState;
  readonly activeDebtCount: number;
  readonly highCostDebtCount: number;
  readonly safetyBufferState: SafetyBufferState;
}

function istCalendarDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

export function computeSafetyInputFingerprint(input: SafetyFingerprintInput): string {
  const canonical = {
    safetyFormulaVersion: SAFETY_POLICY.formulaVersion,
    safetyPolicyVersion: SAFETY_POLICY.policyVersion,
    asOfCalendarDay: istCalendarDay(input.asOf),
    essentialBurn: {
      formulaVersion: input.essentialBurn.formulaVersion,
      average: input.essentialBurn.averageMonthlyEssentialMinor,
      quality: input.essentialBurn.quality,
      observedCompleteMonthCount: input.essentialBurn.observedCompleteMonthCount,
      // The essential-burn "source window" is its set of complete calendar
      // months, not `sourceThrough` -- that field is `computedAt` under
      // another name (see essential-burn.ts's `calculateEssentialBurn`), a
      // fresh wall-clock value on every call that would make this fingerprint
      // unreproducible even when nothing about the underlying facts changed.
      completeMonths: input.essentialBurn.completeMonths.map((month) => month.month)
    },
    reserves: {
      formulaVersion: input.reserves.formulaVersion,
      policyVersion: input.reserves.policyVersion,
      totalEligibleMinor: input.reserves.totalEligibleMinor,
      instantMinor: input.reserves.instantMinor,
      tPlusOneMinor: input.reserves.tPlusOneMinor,
      currentlyEligibleSourceCount: input.reserves.currentlyEligibleSourceCount,
      limitations: [...input.reserves.limitations].sort()
    },
    protection: {
      snapshotId: input.protectionState.currentSnapshot?.id ?? null,
      termCoverState: input.protectionState.termCover.state,
      termCoverExpiryState: input.protectionState.termCover.expiryState,
      healthCoverState: input.protectionState.healthCover.state,
      healthCoverExpiryState: input.protectionState.healthCover.expiryState
    },
    salary: {
      salaryVersionId: input.financialProfileState.currentSalaryVersion?.id ?? null,
      hasCtc: input.financialProfileState.currentSalaryVersion?.annualCtcMinor !== null
    },
    debts: {
      activeDebtCount: input.activeDebtCount,
      highCostDebtCount: input.highCostDebtCount
    },
    safetyBuffer: {
      preferenceVersion: input.safetyBufferState.preference?.version ?? null,
      isFallback: input.safetyBufferState.isFallback,
      targetMinor: input.safetyBufferState.targetMinor
    }
  };

  return createHash("sha256").update(canonicalize(canonical)).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
