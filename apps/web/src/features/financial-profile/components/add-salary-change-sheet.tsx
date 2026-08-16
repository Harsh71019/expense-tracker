"use client";

import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogSurface } from "@/components/ui/dialog";
import { ConflictError, userErrorMessage } from "@/lib/errors";

import { useCreateSalaryVersion } from "../hooks/use-salary-mutations";
import { isoToCalendarDate, parseSalaryForm, type FieldErrors } from "../model/salary-form";

type AddSalaryChangeSheetProps = Readonly<{
  onClose: () => void;
  onSaved: (message: string) => void;
}>;

/**
 * Appends a salary version. The mutation hook holds one idempotency key from
 * mount, so pressing "Save" again after a network failure replays the same
 * request instead of creating a second version.
 */
export function AddSalaryChangeSheet({ onClose, onSaved }: AddSalaryChangeSheetProps): ReactNode {
  const create = useCreateSalaryVersion();
  const [netMonthlySalaryMinor, setNetMonthlySalaryMinor] = useState(0);
  const [annualCtcMinor, setAnnualCtcMinor] = useState(0);
  const [effectiveFrom, setEffectiveFrom] = useState(() => isoToCalendarDate(new Date()));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const salaryInputRef = useRef<HTMLInputElement>(null);

  /** Validation must land the caret on the offending field, not nowhere. */
  function focusField(fieldId: string): void {
    document.getElementById(fieldId)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = parseSalaryForm({ netMonthlySalaryMinor, annualCtcMinor, effectiveFrom });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setFormError(null);
      focusField(parsed.firstFieldId);
      return;
    }

    setErrors({});
    setFormError(null);
    try {
      await create.mutateAsync(parsed.value);
      onSaved("Salary change added.");
      onClose();
    } catch (error: unknown) {
      // A duplicate effective date is the user's to resolve, so it lands on
      // the date field rather than in a generic banner.
      if (error instanceof ConflictError) {
        setErrors({ "salary-effective-from": error.message });
        focusField("salary-effective-from");
        return;
      }
      setFormError(userErrorMessage(error, "Could not save this salary change."));
    }
  }

  return (
    <DialogSurface
      labelledBy="add-salary-change-title"
      describedBy="add-salary-change-description"
      onClose={onClose}
      variant="drawer"
      panelClassName="max-w-[520px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Income
          </p>
          <h2 id="add-salary-change-title" className="mt-1.5 text-xl font-bold text-foreground">
            Add salary change
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close salary change form"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <p id="add-salary-change-description" className="mt-2 text-sm text-foreground-muted">
        This adds a new effective-dated version. Earlier versions stay exactly as they are, so past
        months keep the salary that actually applied.
      </p>

      <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5" noValidate>
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
              The first day this salary applies. One version per date.
            </p>
          ) : (
            <p role="alert" aria-live="polite" className="text-xs font-medium text-expense">
              {errors["salary-effective-from"]}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface-muted/40 p-4">
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
            Optional. CTC is never treated as spendable income — only the net in-hand figure above
            drives every derived number. Leave it at zero to skip it.
          </p>
        </div>

        {formError === null ? null : (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-expense/25 bg-expense/10 px-3 py-2 text-sm font-medium text-expense"
          >
            {formError}
          </p>
        )}

        <div className="safe-area-bottom sticky bottom-0 -mx-5 flex flex-col-reverse gap-2 border-t border-border bg-surface-elevated px-5 pt-4 pb-4 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-2 sm:pb-0">
          <Button
            type="button"
            className="w-full sm:w-auto"
            variant="secondary"
            disabled={create.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" className="w-full sm:w-auto" disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Save salary change"}
          </Button>
        </div>
      </form>
    </DialogSurface>
  );
}
