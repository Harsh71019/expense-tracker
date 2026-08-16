import {
  CreateSalaryVersionSchema,
  FinancialProfileUpdateSchema,
  MINUTES_PER_HOUR,
  SUGGESTED_MONTHLY_WORK_HOURS,
  monthlyWorkHoursFromMinutes,
  type CreateSalaryVersion,
  type FinancialProfile,
  type FinancialProfileUpdate,
  type IncomeStability
} from "@treasury-ops/shared";

/**
 * @file Pure form transforms for the salary and work profile.
 *
 * The UI talks in hours and rupees because that is how people think about
 * pay; the API only ever receives canonical integer minutes, paise, and basis
 * points. Every conversion lives here, is validated, and is tested — no
 * component does arithmetic on a salary itself.
 */

export const INCOME_STABILITY_OPTIONS: readonly Readonly<{
  value: IncomeStability;
  label: string;
  description: string;
}>[] = [
  {
    value: "stable",
    label: "Stable",
    description: "The same amount lands every month."
  },
  {
    value: "variable",
    label: "Variable",
    description: "The amount moves month to month, but arrives on schedule."
  },
  {
    value: "irregular",
    label: "Irregular",
    description: "Both the amount and the timing change."
  }
];

export type WorkProfileFormValues = Readonly<{
  /** Whole or half hours as typed by the user; converted before submission. */
  monthlyWorkHours: string;
  incomeStability: IncomeStability;
  salaryCreditDay: string;
  expectedAnnualIncrementPercent: string;
}>;

export type SalaryFormValues = Readonly<{
  netMonthlySalaryMinor: number;
  annualCtcMinor: number;
  /** `YYYY-MM-DD` as produced by the shared date picker. */
  effectiveFrom: string;
}>;

export type FieldErrors = Readonly<Record<string, string>>;

export type ParseResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; errors: FieldErrors; firstFieldId: string }>;

/**
 * The 160 h/month figure is a *suggestion*: it prefills the field, stays
 * editable, and is submitted only because the user left it in place. Nothing
 * downstream treats it as a confirmed fact until the profile is saved.
 */
export function initialWorkProfileValues(profile: FinancialProfile | null): WorkProfileFormValues {
  if (profile === null) {
    return {
      monthlyWorkHours: String(SUGGESTED_MONTHLY_WORK_HOURS),
      incomeStability: "stable",
      salaryCreditDay: "",
      expectedAnnualIncrementPercent: ""
    };
  }
  return {
    monthlyWorkHours: String(monthlyWorkHoursFromMinutes(profile.monthlyWorkMinutes)),
    incomeStability: profile.incomeStability,
    salaryCreditDay: profile.salaryCreditDay === null ? "" : String(profile.salaryCreditDay),
    expectedAnnualIncrementPercent:
      profile.expectedAnnualIncrementBps === null
        ? ""
        : formatBpsAsPercent(profile.expectedAnnualIncrementBps)
  };
}

/** Basis points → a trimmed percentage string, for display only. */
export function formatBpsAsPercent(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = Math.abs(bps % 100);
  return fraction === 0
    ? String(whole)
    : `${whole}.${fraction.toString().padStart(2, "0").replace(/0$/, "")}`;
}

/** A percentage string with at most two decimals → integer basis points. */
export function percentToBps(input: string): number {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new RangeError("Enter a percentage with at most two decimal places.");
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/**
 * Validates the work-profile fields and converts them into the canonical
 * PATCH body. Returns the first offending field id so the caller can move
 * focus to it rather than leaving a screen-reader user hunting for the error.
 */
export function parseWorkProfileForm(
  values: WorkProfileFormValues
): ParseResult<FinancialProfileUpdate> {
  const errors: Record<string, string> = {};

  let monthlyWorkMinutes = 0;
  const hours = values.monthlyWorkHours.trim();
  if (hours === "") {
    errors["salary-work-hours"] = "Enter your normal monthly working hours.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(hours)) {
    errors["salary-work-hours"] = "Working hours must be a positive number.";
  } else {
    const minutes = Math.round(Number(hours) * MINUTES_PER_HOUR);
    if (Math.abs(Number(hours) * MINUTES_PER_HOUR - minutes) > 1e-6) {
      errors["salary-work-hours"] = "Working hours must resolve to whole minutes.";
    } else {
      monthlyWorkMinutes = minutes;
    }
  }

  let salaryCreditDay: number | null = null;
  const creditDay = values.salaryCreditDay.trim();
  if (creditDay !== "") {
    if (!/^\d{1,2}$/.test(creditDay)) {
      errors["salary-credit-day"] = "Salary credit day must be a day between 1 and 31.";
    } else {
      salaryCreditDay = Number(creditDay);
    }
  }

  let expectedAnnualIncrementBps: number | null = null;
  const increment = values.expectedAnnualIncrementPercent.trim();
  if (increment !== "") {
    try {
      expectedAnnualIncrementBps = percentToBps(increment);
    } catch {
      errors["salary-increment"] = "Expected increment must be a percentage, for example 8.5.";
    }
  }

  if (Object.keys(errors).length === 0) {
    const parsed = FinancialProfileUpdateSchema.safeParse({
      monthlyWorkMinutes,
      incomeStability: values.incomeStability,
      salaryCreditDay,
      expectedAnnualIncrementBps
    });
    if (parsed.success) {
      return { ok: true, value: parsed.data };
    }
    for (const issue of parsed.error.issues) {
      const fieldId = WORK_PROFILE_FIELD_IDS[String(issue.path[0])] ?? "salary-work-hours";
      errors[fieldId] ??= issue.message;
    }
  }

  return { ok: false, errors, firstFieldId: firstFieldId(errors, WORK_PROFILE_FIELD_ORDER) };
}

/**
 * Validates the salary fields and converts them into the canonical POST body.
 * A blank annual CTC stays absent rather than becoming zero — CTC is optional
 * and never a spendable figure.
 */
export function parseSalaryForm(values: SalaryFormValues): ParseResult<CreateSalaryVersion> {
  const errors: Record<string, string> = {};

  if (values.netMonthlySalaryMinor <= 0) {
    errors["salary-net-monthly"] = "Enter your net monthly in-hand salary.";
  }
  if (values.effectiveFrom.trim() === "") {
    errors["salary-effective-from"] = "Choose the date this salary takes effect.";
  }

  if (Object.keys(errors).length === 0) {
    const parsed = CreateSalaryVersionSchema.safeParse({
      netMonthlySalaryMinor: values.netMonthlySalaryMinor,
      annualCtcMinor: values.annualCtcMinor > 0 ? values.annualCtcMinor : null,
      effectiveFrom: calendarDateToIso(values.effectiveFrom)
    });
    if (parsed.success) {
      return { ok: true, value: parsed.data };
    }
    for (const issue of parsed.error.issues) {
      const fieldId = SALARY_FIELD_IDS[String(issue.path[0])] ?? "salary-net-monthly";
      errors[fieldId] ??= issue.message;
    }
  }

  return { ok: false, errors, firstFieldId: firstFieldId(errors, SALARY_FIELD_ORDER) };
}

/**
 * `YYYY-MM-DD` from the date picker is a calendar day, not an instant. It is
 * sent as that day's UTC midnight; the API re-anchors it to the Asia/Kolkata
 * calendar day, which is the authority on when a salary becomes effective.
 */
export function calendarDateToIso(calendarDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
    throw new RangeError("Effective date must be a YYYY-MM-DD calendar date.");
  }
  return `${calendarDate}T00:00:00.000Z`;
}

/** An instant → the `YYYY-MM-DD` the date picker expects. */
export function isoToCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const WORK_PROFILE_FIELD_IDS: Readonly<Record<string, string>> = {
  monthlyWorkMinutes: "salary-work-hours",
  incomeStability: "salary-income-stability",
  salaryCreditDay: "salary-credit-day",
  expectedAnnualIncrementBps: "salary-increment"
};
const WORK_PROFILE_FIELD_ORDER = [
  "salary-work-hours",
  "salary-income-stability",
  "salary-credit-day",
  "salary-increment"
] as const;

const SALARY_FIELD_IDS: Readonly<Record<string, string>> = {
  netMonthlySalaryMinor: "salary-net-monthly",
  annualCtcMinor: "salary-annual-ctc",
  effectiveFrom: "salary-effective-from"
};
const SALARY_FIELD_ORDER = [
  "salary-net-monthly",
  "salary-effective-from",
  "salary-annual-ctc"
] as const;

function firstFieldId(errors: FieldErrors, order: readonly string[]): string {
  return order.find((fieldId) => errors[fieldId] !== undefined) ?? order[0] ?? "";
}
