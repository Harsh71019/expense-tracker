"use client";

import type { HealthCoverStatus, ProtectionSnapshot, TermCoverStatus } from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { ConflictError, userErrorMessage } from "@/lib/errors";

import { useSaveProtection } from "../hooks/use-protection";
import {
  HEALTH_COVER_OPTIONS,
  TERM_COVER_OPTIONS,
  TERM_NOT_APPLICABLE_REASONS,
  initialProtectionValues,
  parseProtectionForm,
  showEmployerHealthFields,
  showEmployerTermFields,
  showIndependentHealthFields,
  showIndependentTermFields,
  showTermNotApplicableReason,
  type ProtectionFormValues
} from "../model/protection-form";
import type { FieldErrors } from "../model/salary-form";

type ProtectionProfileFormProps = Readonly<{
  snapshot: ProtectionSnapshot | null;
  onSaved: (message: string) => void;
}>;

/**
 * The protection questionnaire.
 *
 * Amount fields appear only for the cover source the chosen status actually
 * claims, and the values behind hidden fields are dropped on submit — so
 * switching from "my own policy" to "not sure" cannot leave a stale sum assured
 * behind. Saving appends a new effective-dated snapshot; it never rewrites the
 * answers that applied before.
 */
export function ProtectionProfileForm({
  snapshot,
  onSaved
}: ProtectionProfileFormProps): ReactNode {
  const save = useSaveProtection();
  const [values, setValues] = useState<ProtectionFormValues>(() =>
    initialProtectionValues(snapshot)
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof ProtectionFormValues>(
    field: K,
    value: ProtectionFormValues[K]
  ): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  /** Validation must land the caret on the offending field, not nowhere. */
  function focusField(fieldId: string): void {
    document.getElementById(fieldId)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = parseProtectionForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setFormError(null);
      focusField(parsed.firstFieldId);
      return;
    }

    setErrors({});
    setFormError(null);
    try {
      await save.mutateAsync(parsed.value);
      onSaved("Protection answers saved.");
    } catch (error: unknown) {
      // A duplicate effective date is the user's to resolve, so it lands on the
      // date field rather than in a generic banner.
      if (error instanceof ConflictError) {
        setErrors({ "protection-effective-from": error.message });
        focusField("protection-effective-from");
        return;
      }
      setFormError(userErrorMessage(error, "Could not save your protection answers."));
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-6" noValidate>
      <fieldset className="space-y-5 rounded-2xl border border-border bg-surface-muted/40 p-4 sm:p-5">
        <legend className="px-1 font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
          Term life cover
        </legend>

        <StatusChoice<TermCoverStatus>
          id="protection-term-status"
          legend="Do you have term life cover?"
          name="term-cover-status"
          options={TERM_COVER_OPTIONS}
          value={values.termCoverStatus}
          onChange={(next) => update("termCoverStatus", next)}
        />

        {showTermNotApplicableReason(values.termCoverStatus) ? (
          <div className="flex flex-col gap-2">
            <span
              id="protection-term-reason-label"
              className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
            >
              Why does term cover not apply?
            </span>
            <div
              role="radiogroup"
              id="protection-term-reason"
              aria-labelledby="protection-term-reason-label"
              aria-describedby="protection-term-reason-hint"
              className="grid gap-2"
            >
              {TERM_NOT_APPLICABLE_REASONS.map((reason) => (
                <label
                  key={reason.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2.5 transition-colors ${
                    values.termNotApplicableReason === reason.value
                      ? "border-accent/50 bg-accent-glow/40"
                      : "border-border bg-surface hover:border-accent/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="term-not-applicable-reason"
                    value={reason.value}
                    checked={values.termNotApplicableReason === reason.value}
                    onChange={() => update("termNotApplicableReason", reason.value)}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  <span className="text-sm text-foreground">{reason.label}</span>
                </label>
              ))}
            </div>
            {errors["protection-term-reason"] === undefined ? (
              <p id="protection-term-reason-hint" className="text-xs text-foreground-muted">
                Pick the closest reason. There is no free-text box here on purpose.
              </p>
            ) : (
              <p role="alert" aria-live="polite" className="text-xs font-medium text-expense">
                {errors["protection-term-reason"]}
              </p>
            )}
          </div>
        ) : null}

        {showIndependentTermFields(values.termCoverStatus) ? (
          <div className="space-y-4">
            <AmountInput
              id="protection-independent-term"
              label="Your own term cover (sum assured)"
              value={values.independentTermCoverMinor}
              onChange={(minor) => update("independentTermCoverMinor", minor)}
              {...(errors["protection-independent-term"] === undefined
                ? {}
                : { error: errors["protection-independent-term"] })}
            />
            <p className="-mt-2 text-xs text-foreground-muted">
              Leave it at zero if you do not remember. The answer stays recorded as incomplete
              rather than being guessed.
            </p>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="protection-term-expiry"
                className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
              >
                Policy expiry (optional)
              </label>
              <DatePicker
                id="protection-term-expiry"
                value={values.independentTermExpiresOn}
                onChange={(next) => update("independentTermExpiresOn", next)}
                clearable
              />
              <p className="text-xs text-foreground-muted">
                Used only to warn you before the cover lapses.
              </p>
            </div>
          </div>
        ) : null}

        {showEmployerTermFields(values.termCoverStatus) ? (
          <div>
            <AmountInput
              id="protection-employer-term"
              label="Employer term cover (sum assured)"
              value={values.employerTermCoverMinor}
              onChange={(minor) => update("employerTermCoverMinor", minor)}
              {...(errors["protection-employer-term"] === undefined
                ? {}
                : { error: errors["protection-employer-term"] })}
            />
            <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
              Employer cover usually ends when the employment does, so it is recorded separately
              from cover you hold yourself.
            </p>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-5 rounded-2xl border border-border bg-surface-muted/40 p-4 sm:p-5">
        <legend className="px-1 font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
          Health cover
        </legend>

        <StatusChoice<HealthCoverStatus>
          id="protection-health-status"
          legend="Do you have health cover?"
          name="health-cover-status"
          options={HEALTH_COVER_OPTIONS}
          value={values.healthCoverStatus}
          onChange={(next) => update("healthCoverStatus", next)}
        />

        {showIndependentHealthFields(values.healthCoverStatus) ? (
          <div className="space-y-4">
            <AmountInput
              id="protection-health-base"
              label="Your own base cover"
              value={values.independentHealthBaseCoverMinor}
              onChange={(minor) => update("independentHealthBaseCoverMinor", minor)}
              {...(errors["protection-health-base"] === undefined
                ? {}
                : { error: errors["protection-health-base"] })}
            />
            <AmountInput
              id="protection-health-topup"
              label="Super top-up cover (optional)"
              value={values.independentHealthSuperTopUpMinor}
              onChange={(minor) => update("independentHealthSuperTopUpMinor", minor)}
              {...(errors["protection-health-topup"] === undefined
                ? {}
                : { error: errors["protection-health-topup"] })}
            />
            <p className="-mt-2 text-xs leading-relaxed text-foreground-muted">
              A super top-up sits above your base cover and is recorded separately, because the two
              do not simply add up when you claim.
            </p>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="protection-health-expiry"
                className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
              >
                Policy expiry (optional)
              </label>
              <DatePicker
                id="protection-health-expiry"
                value={values.independentHealthExpiresOn}
                onChange={(next) => update("independentHealthExpiresOn", next)}
                clearable
              />
            </div>
          </div>
        ) : null}

        {showEmployerHealthFields(values.healthCoverStatus) ? (
          <div>
            <AmountInput
              id="protection-employer-health"
              label="Employer health cover"
              value={values.employerHealthCoverMinor}
              onChange={(minor) => update("employerHealthCoverMinor", minor)}
              {...(errors["protection-employer-health"] === undefined
                ? {}
                : { error: errors["protection-employer-health"] })}
            />
            <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
              Group cover from your employer, which typically ends with the employment.
            </p>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-5 rounded-2xl border border-border bg-surface-muted/40 p-4 sm:p-5">
        <legend className="px-1 font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
          Context
        </legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Input
              id="protection-dependants"
              label="People who depend on your income"
              type="text"
              inputMode="numeric"
              value={values.dependantCount}
              onChange={(event) => update("dependantCount", event.target.value)}
              aria-describedby="protection-dependants-hint"
              {...(errors["protection-dependants"] === undefined
                ? {}
                : { error: errors["protection-dependants"] })}
            />
            <p id="protection-dependants-hint" className="mt-1.5 text-xs text-foreground-muted">
              Count anyone who would need to replace your income. Zero is a valid answer.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="protection-effective-from"
              className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
            >
              Effective from
            </label>
            <DatePicker
              id="protection-effective-from"
              value={values.effectiveFrom}
              onChange={(next) => update("effectiveFrom", next)}
            />
            {errors["protection-effective-from"] === undefined ? (
              <p className="text-xs text-foreground-muted">
                Saving appends a new dated set of answers. Earlier answers stay exactly as they were
                — one set per date.
              </p>
            ) : (
              <p role="alert" aria-live="polite" className="text-xs font-medium text-expense">
                {errors["protection-effective-from"]}
              </p>
            )}
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
        <Button type="submit" className="w-full sm:w-auto" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save protection answers"}
        </Button>
      </div>
    </form>
  );
}

type StatusChoiceProps<T extends string> = Readonly<{
  id: string;
  legend: string;
  name: string;
  options: readonly Readonly<{ value: T; label: string; description: string }>[];
  value: T;
  onChange: (value: T) => void;
}>;

function StatusChoice<T extends string>({
  id,
  legend,
  name,
  options,
  value,
  onChange
}: StatusChoiceProps<T>): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <span
        id={`${id}-label`}
        className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
      >
        {legend}
      </span>
      <div
        role="radiogroup"
        id={id}
        aria-labelledby={`${id}-label`}
        className="grid gap-2 sm:grid-cols-2"
      >
        {options.map((option) => {
          const selected = value === option.value;
          const descriptionId = `${id}-${option.value}-description`;
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
                  name={name}
                  value={option.value}
                  checked={selected}
                  aria-describedby={descriptionId}
                  onChange={() => onChange(option.value)}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                <span className="text-sm font-semibold text-foreground">{option.label}</span>
              </span>
              <span id={descriptionId} className="text-xs text-foreground-muted">
                {option.description}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
