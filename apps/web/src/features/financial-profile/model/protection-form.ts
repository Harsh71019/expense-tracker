import {
  MAX_DEPENDANT_COUNT,
  UpsertProtectionSchema,
  statusHasEmployerCover,
  statusHasIndependentCover,
  type HealthCoverStatus,
  type ProtectionCoverageState,
  type ProtectionExpiryState,
  type ProtectionSnapshot,
  type TermCoverStatus,
  type TermNotApplicableReason,
  type UpsertProtection
} from "@treasury-ops/shared";

import { calendarDateToIso, isoToCalendarDate, type ParseResult } from "./salary-form";

/**
 * @file Pure form transforms for protection answers.
 *
 * Two things this file deliberately does *not* do: compute an adequacy ratio
 * (the 10x–15x CTC rule belongs to the safety ladder, not to a form), and turn
 * a completed form into a reassuring verdict. It converts UI values into the
 * canonical request body and back, nothing more.
 */

export type ProtectionFormValues = Readonly<{
  effectiveFrom: string;
  termCoverStatus: TermCoverStatus;
  termNotApplicableReason: TermNotApplicableReason | "";
  independentTermCoverMinor: number;
  employerTermCoverMinor: number;
  independentTermExpiresOn: string;
  healthCoverStatus: HealthCoverStatus;
  independentHealthBaseCoverMinor: number;
  independentHealthSuperTopUpMinor: number;
  employerHealthCoverMinor: number;
  independentHealthExpiresOn: string;
  dependantCount: string;
}>;

export const TERM_COVER_OPTIONS: readonly Readonly<{
  value: TermCoverStatus;
  label: string;
  description: string;
}>[] = [
  {
    value: "independent",
    label: "I hold my own policy",
    description: "A term policy you bought yourself, which stays with you if you change jobs."
  },
  {
    value: "employer_only",
    label: "Employer cover only",
    description: "Provided by your employer. It usually ends when the employment does."
  },
  {
    value: "both",
    label: "Both",
    description: "Your own policy plus employer cover."
  },
  { value: "none", label: "No term cover", description: "You hold no term life cover today." },
  {
    value: "not_sure",
    label: "Not sure",
    description: "Recorded as unknown. Nothing will treat this as covered."
  },
  {
    value: "not_applicable",
    label: "Does not apply to me",
    description: "Choose a reason below. Term life is not relevant for everyone."
  }
];

export const HEALTH_COVER_OPTIONS: readonly Readonly<{
  value: HealthCoverStatus;
  label: string;
  description: string;
}>[] = [
  {
    value: "independent",
    label: "I hold my own policy",
    description: "A personal health policy that is not tied to your job."
  },
  {
    value: "employer_only",
    label: "Employer cover only",
    description: "Group cover from your employer. It usually ends when the employment does."
  },
  { value: "both", label: "Both", description: "Your own policy plus employer group cover." },
  { value: "none", label: "No health cover", description: "You hold no health cover today." },
  {
    value: "not_sure",
    label: "Not sure",
    description: "Recorded as unknown. Nothing will treat this as covered."
  }
];

export const TERM_NOT_APPLICABLE_REASONS: readonly Readonly<{
  value: TermNotApplicableReason;
  label: string;
}>[] = [
  { value: "no_financial_dependants", label: "Nobody depends on my income" },
  {
    value: "covered_by_existing_family_arrangement",
    label: "An existing family arrangement covers this"
  },
  { value: "other_personal_reason", label: "Another personal reason" }
];

/** Labels for the server-derived coverage states. Never a bare colour. */
export const COVERAGE_STATE_LABELS: Readonly<Record<ProtectionCoverageState, string>> = {
  not_configured: "Not recorded",
  complete: "Recorded",
  incomplete: "Amount missing",
  unknown: "Not sure",
  employer_only: "Employer only",
  none_declared: "No cover declared",
  not_applicable: "Not applicable"
};

export const EXPIRY_STATE_LABELS: Readonly<Record<ProtectionExpiryState, string>> = {
  not_applicable: "No expiry recorded",
  active: "Active",
  expiring: "Expiring soon",
  expired: "Expired"
};

/** A completed form is never a green verdict — only these two states are settled. */
export function isSettledCoverageState(state: ProtectionCoverageState): boolean {
  return state === "complete" || state === "not_applicable";
}

export function showIndependentTermFields(status: TermCoverStatus): boolean {
  return statusHasIndependentCover(status);
}

export function showEmployerTermFields(status: TermCoverStatus): boolean {
  return statusHasEmployerCover(status);
}

export function showIndependentHealthFields(status: HealthCoverStatus): boolean {
  return statusHasIndependentCover(status);
}

export function showEmployerHealthFields(status: HealthCoverStatus): boolean {
  return statusHasEmployerCover(status);
}

export function showTermNotApplicableReason(status: TermCoverStatus): boolean {
  return status === "not_applicable";
}

/** Prefills from the effective snapshot, or an all-unknown blank form. */
export function initialProtectionValues(snapshot: ProtectionSnapshot | null): ProtectionFormValues {
  if (snapshot === null) {
    return {
      effectiveFrom: isoToCalendarDate(new Date()),
      termCoverStatus: "not_sure",
      termNotApplicableReason: "",
      independentTermCoverMinor: 0,
      employerTermCoverMinor: 0,
      independentTermExpiresOn: "",
      healthCoverStatus: "not_sure",
      independentHealthBaseCoverMinor: 0,
      independentHealthSuperTopUpMinor: 0,
      employerHealthCoverMinor: 0,
      independentHealthExpiresOn: "",
      dependantCount: "0"
    };
  }

  return {
    // A new answer is a new effective date; today is the honest default.
    effectiveFrom: isoToCalendarDate(new Date()),
    termCoverStatus: snapshot.termCoverStatus,
    termNotApplicableReason: snapshot.termNotApplicableReason ?? "",
    independentTermCoverMinor: snapshot.independentTermCoverMinor ?? 0,
    employerTermCoverMinor: snapshot.employerTermCoverMinor ?? 0,
    independentTermExpiresOn:
      snapshot.independentTermExpiresOn === null
        ? ""
        : isoToCalendarDate(snapshot.independentTermExpiresOn),
    healthCoverStatus: snapshot.healthCoverStatus,
    independentHealthBaseCoverMinor: snapshot.independentHealthBaseCoverMinor ?? 0,
    independentHealthSuperTopUpMinor: snapshot.independentHealthSuperTopUpMinor ?? 0,
    employerHealthCoverMinor: snapshot.employerHealthCoverMinor ?? 0,
    independentHealthExpiresOn:
      snapshot.independentHealthExpiresOn === null
        ? ""
        : isoToCalendarDate(snapshot.independentHealthExpiresOn),
    dependantCount: String(snapshot.dependantCount)
  };
}

/** A zero amount means "not recorded"; the API rejects zero cover explicitly. */
function optionalMinor(value: number, visible: boolean): number | null {
  return visible && value > 0 ? value : null;
}

function optionalDate(value: string, visible: boolean): string | null {
  return visible && value.trim() !== "" ? calendarDateToIso(value) : null;
}

/**
 * Validates the protection form and converts it into the canonical PUT body.
 * Fields hidden by the current status are dropped rather than sent, so
 * switching from "independent" to "not sure" cannot leave a stale amount behind
 * for the API to reject.
 */
export function parseProtectionForm(values: ProtectionFormValues): ParseResult<UpsertProtection> {
  const errors: Record<string, string> = {};

  if (values.effectiveFrom.trim() === "") {
    errors["protection-effective-from"] = "Choose the date these answers take effect.";
  }

  let dependantCount = 0;
  const dependants = values.dependantCount.trim();
  if (dependants === "") {
    errors["protection-dependants"] = "Enter how many people depend on your income.";
  } else if (!/^\d{1,2}$/.test(dependants)) {
    errors["protection-dependants"] = "Dependants must be a whole number.";
  } else if (Number(dependants) > MAX_DEPENDANT_COUNT) {
    errors["protection-dependants"] = `Dependants cannot exceed ${MAX_DEPENDANT_COUNT}.`;
  } else {
    dependantCount = Number(dependants);
  }

  if (
    showTermNotApplicableReason(values.termCoverStatus) &&
    values.termNotApplicableReason === ""
  ) {
    errors["protection-term-reason"] = "Choose why term cover does not apply to you.";
  }

  if (Object.keys(errors).length === 0) {
    const independentTerm = showIndependentTermFields(values.termCoverStatus);
    const employerTerm = showEmployerTermFields(values.termCoverStatus);
    const independentHealth = showIndependentHealthFields(values.healthCoverStatus);
    const employerHealth = showEmployerHealthFields(values.healthCoverStatus);

    const parsed = UpsertProtectionSchema.safeParse({
      effectiveFrom: calendarDateToIso(values.effectiveFrom),
      termCoverStatus: values.termCoverStatus,
      termNotApplicableReason: showTermNotApplicableReason(values.termCoverStatus)
        ? values.termNotApplicableReason
        : null,
      independentTermCoverMinor: optionalMinor(values.independentTermCoverMinor, independentTerm),
      employerTermCoverMinor: optionalMinor(values.employerTermCoverMinor, employerTerm),
      independentTermExpiresOn: optionalDate(values.independentTermExpiresOn, independentTerm),
      healthCoverStatus: values.healthCoverStatus,
      independentHealthBaseCoverMinor: optionalMinor(
        values.independentHealthBaseCoverMinor,
        independentHealth
      ),
      independentHealthSuperTopUpMinor: optionalMinor(
        values.independentHealthSuperTopUpMinor,
        independentHealth
      ),
      employerHealthCoverMinor: optionalMinor(values.employerHealthCoverMinor, employerHealth),
      independentHealthExpiresOn: optionalDate(
        values.independentHealthExpiresOn,
        independentHealth
      ),
      dependantCount
    });
    if (parsed.success) return { ok: true, value: parsed.data };

    for (const issue of parsed.error.issues) {
      const fieldId = PROTECTION_FIELD_IDS[String(issue.path[0])] ?? "protection-term-status";
      errors[fieldId] ??= issue.message;
    }
  }

  return { ok: false, errors, firstFieldId: firstFieldId(errors, PROTECTION_FIELD_ORDER) };
}

const PROTECTION_FIELD_IDS: Readonly<Record<string, string>> = {
  effectiveFrom: "protection-effective-from",
  termCoverStatus: "protection-term-status",
  termNotApplicableReason: "protection-term-reason",
  independentTermCoverMinor: "protection-independent-term",
  employerTermCoverMinor: "protection-employer-term",
  independentTermExpiresOn: "protection-term-expiry",
  healthCoverStatus: "protection-health-status",
  independentHealthBaseCoverMinor: "protection-health-base",
  independentHealthSuperTopUpMinor: "protection-health-topup",
  employerHealthCoverMinor: "protection-employer-health",
  independentHealthExpiresOn: "protection-health-expiry",
  dependantCount: "protection-dependants"
};

const PROTECTION_FIELD_ORDER = [
  "protection-term-status",
  "protection-term-reason",
  "protection-independent-term",
  "protection-employer-term",
  "protection-term-expiry",
  "protection-health-status",
  "protection-health-base",
  "protection-health-topup",
  "protection-employer-health",
  "protection-health-expiry",
  "protection-dependants",
  "protection-effective-from"
] as const;

function firstFieldId(errors: Readonly<Record<string, string>>, order: readonly string[]): string {
  return order.find((fieldId) => errors[fieldId] !== undefined) ?? order[0] ?? "";
}
