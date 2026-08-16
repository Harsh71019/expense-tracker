"use client";

import {
  SUGGESTED_MONTHLY_WORK_HOURS,
  type FinancialProfile,
  type SalaryVersion
} from "@treasury-ops/shared";
import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { ConflictError, userErrorMessage } from "@/lib/errors";

import { useCreateSalaryVersion, useUpdateFinancialProfile } from "../hooks/use-salary-mutations";
import {
  INCOME_STABILITY_OPTIONS,
  initialWorkProfileValues,
  isoToCalendarDate,
  parseSalaryForm,
  parseWorkProfileForm,
  type FieldErrors,
  type WorkProfileFormValues
} from "../model/salary-form";

type SalaryProfileFormProps = Readonly<{
  profile: FinancialProfile | null;
  currentSalaryVersion: SalaryVersion | null;
  onSaved: (message: string) => void;
}>;

/**
 * The single editor for salary and work facts.
 *
 * Before any salary exists this is a setup form: work schedule *and* the
 * first net monthly salary with its effective date. Once a salary version
 * exists the salary fields disappear — history is append-only, so changing
 * pay goes through "Add salary change" instead of editing this form.
 */
export function SalaryProfileForm({
  profile,
  currentSalaryVersion,
  onSaved
}: SalaryProfileFormProps): ReactNode {
  const updateProfile = useUpdateFinancialProfile();
  const createSalary = useCreateSalaryVersion();
  const setupMode = currentSalaryVersion === null;

  const [values, setValues] = useState<WorkProfileFormValues>(() =>
    initialWorkProfileValues(profile)
  );
  const [netMonthlySalaryMinor, setNetMonthlySalaryMinor] = useState(0);
  const [annualCtcMinor, setAnnualCtcMinor] = useState(0);
  const [effectiveFrom, setEffectiveFrom] = useState(() => isoToCalendarDate(new Date()));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const salaryInputRef = useRef<HTMLInputElement>(null);

  const isPending = updateProfile.isPending || createSalary.isPending;

  function update<K extends keyof WorkProfileFormValues>(
    field: K,
    value: WorkProfileFormValues[K]
  ): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function focusField(fieldId: string): void {
    document.getElementById(fieldId)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const workProfile = parseWorkProfileForm(values);
    if (!workProfile.ok) {
      setErrors(workProfile.errors);
      setFormError(null);
      focusField(workProfile.firstFieldId);
      return;
    }

    const salary = setupMode
      ? parseSalaryForm({ netMonthlySalaryMinor, annualCtcMinor, effectiveFrom })
      : null;
    if (salary !== null && !salary.ok) {
      setErrors(salary.errors);
      setFormError(null);
      focusField(salary.firstFieldId);
      return;
    }

    setErrors({});
    setFormError(null);
    try {
      await updateProfile.mutateAsync(workProfile.value);
      if (salary !== null && salary.ok) {
        await createSalary.mutateAsync(salary.value);
      }
      onSaved(setupMode ? "Salary and work profile saved." : "Work profile saved.");
    } catch (error: unknown) {
      if (error instanceof ConflictError) {
        setErrors({ "salary-effective-from": error.message });
        focusField("salary-effective-from");
        return;
      }
      setFormError(userErrorMessage(error, "Could not save your salary and work profile."));
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-6" noValidate>
      {setupMode ? (
        <fieldset className="space-y-5 rounded-2xl border border-border bg-surface-muted/40 p-4 sm:p-5">
          <legend className="px-1 font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Income
          </legend>

          <AmountInput
            id="salary-net-monthly"
            label="Net monthly in-hand salary"
            value={netMonthlySalaryMinor}
            onChange={setNetMonthlySalaryMinor}
            inputRef={salaryInputRef}
            {...(errors["salary-net-monthly"] === undefined
              ? {}
              : { error: errors["salary-net-monthly"] })}
          />
          <p className="text-xs leading-relaxed text-foreground-muted">
            What actually reaches your bank each month, after tax and deductions. Every derived
            figure uses this, not CTC.
          </p>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="salary-effective-from"
              className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
            >
              Effective from
            </label>
            <DatePicker
              id="salary-effective-from"
              value={effectiveFrom}
              onChange={setEffectiveFrom}
            />
            {errors["salary-effective-from"] === undefined ? (
              <p className="text-xs text-foreground-muted">
                The first day this salary applied. Later changes are added as new versions.
              </p>
            ) : (
              <p role="alert" aria-live="polite" className="text-xs font-medium text-expense">
                {errors["salary-effective-from"]}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <AmountInput
              id="salary-annual-ctc"
              label="Annual CTC (optional)"
              value={annualCtcMinor}
              onChange={setAnnualCtcMinor}
              {...(errors["salary-annual-ctc"] === undefined
                ? {}
                : { error: errors["salary-annual-ctc"] })}
            />
            <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
              Optional, and never counted as spendable income. Leave it at zero to skip it.
            </p>
          </div>
        </fieldset>
      ) : null}

      <fieldset className="space-y-5 rounded-2xl border border-border bg-surface-muted/40 p-4 sm:p-5">
        <legend className="px-1 font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
          Work schedule
        </legend>

        <Input
          id="salary-work-hours"
          label="Normal monthly working hours"
          type="text"
          inputMode="decimal"
          value={values.monthlyWorkHours}
          onChange={(event) => update("monthlyWorkHours", event.target.value)}
          aria-describedby="salary-work-hours-hint"
          {...(errors["salary-work-hours"] === undefined
            ? {}
            : { error: errors["salary-work-hours"] })}
        />
        <p id="salary-work-hours-hint" className="-mt-3 text-xs text-foreground-muted">
          Suggested: {SUGGESTED_MONTHLY_WORK_HOURS} hours a month. Edit it to match your actual
          schedule — the suggestion only counts once you save it.
        </p>

        <div className="flex flex-col gap-2">
          <span
            id="salary-income-stability-label"
            className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
          >
            Income stability
          </span>
          <div
            role="radiogroup"
            aria-labelledby="salary-income-stability-label"
            id="salary-income-stability"
            className="grid gap-2 sm:grid-cols-3"
          >
            {INCOME_STABILITY_OPTIONS.map((option) => {
              const selected = values.incomeStability === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-3 transition-colors ${
                    selected
                      ? "border-accent/50 bg-accent-glow/40"
                      : "border-border bg-surface hover:border-accent/30"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="income-stability"
                      value={option.value}
                      checked={selected}
                      onChange={() => update("incomeStability", option.value)}
                      className="h-4 w-4 accent-[var(--color-accent)]"
                    />
                    <span className="text-sm font-semibold text-foreground">{option.label}</span>
                  </span>
                  <span className="text-xs text-foreground-muted">{option.description}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Input
              id="salary-credit-day"
              label="Salary credit day (optional)"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1"
              value={values.salaryCreditDay}
              onChange={(event) => update("salaryCreditDay", event.target.value)}
              aria-describedby="salary-credit-day-hint"
              {...(errors["salary-credit-day"] === undefined
                ? {}
                : { error: errors["salary-credit-day"] })}
            />
            <p id="salary-credit-day-hint" className="mt-1.5 text-xs text-foreground-muted">
              The day of the month your salary usually lands, in IST.
            </p>
          </div>

          <div>
            <Input
              id="salary-increment"
              label="Expected annual increment % (optional)"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 8.5"
              value={values.expectedAnnualIncrementPercent}
              onChange={(event) => update("expectedAnnualIncrementPercent", event.target.value)}
              aria-describedby="salary-increment-hint"
              {...(errors["salary-increment"] === undefined
                ? {}
                : { error: errors["salary-increment"] })}
            />
            <p id="salary-increment-hint" className="mt-1.5 text-xs text-foreground-muted">
              Recorded as an assumption. It does not change any figure shown today.
            </p>
          </div>
        </div>
      </fieldset>

      {formError === null ? null : (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-expense/25 bg-expense/10 px-3 py-2 text-sm font-medium text-expense"
        >
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
          {isPending ? "Saving…" : setupMode ? "Save salary profile" : "Save work profile"}
        </Button>
      </div>
    </form>
  );
}
