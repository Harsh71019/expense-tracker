"use client";

import type { Asset } from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { userErrorMessage } from "@/lib/errors";

import { useCreateDeclaredDebt } from "../hooks/use-debt-profile";
import {
  DEBT_KIND_OPTIONS,
  emptyDebtFormValues,
  linkableAssets,
  parseDebtForm,
  type DebtFormValues
} from "../model/debt-form";
import type { FieldErrors } from "../model/salary-form";

type DebtFormSheetProps = Readonly<{
  assets: readonly Asset[];
  onClose: () => void;
  onSaved: (message: string) => void;
}>;

/**
 * Declares a debt. The mutation hook holds one idempotency key from mount, so
 * pressing "Save" again after a network failure replays the same request
 * instead of declaring the debt twice.
 */
export function DebtFormSheet({ assets, onClose, onSaved }: DebtFormSheetProps): ReactNode {
  const create = useCreateDeclaredDebt();
  const [values, setValues] = useState<DebtFormValues>(emptyDebtFormValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const loanLiabilities = linkableAssets(assets);
  const linked = values.linkedAssetId !== "";

  function update<K extends keyof DebtFormValues>(field: K, value: DebtFormValues[K]): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function focusField(fieldId: string): void {
    document.getElementById(fieldId)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = parseDebtForm(values);
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
      onSaved("Debt added to your planning list.");
      onClose();
    } catch (error: unknown) {
      setFormError(userErrorMessage(error, "Could not save this debt."));
    }
  }

  return (
    <DialogSurface
      labelledBy="debt-form-title"
      describedBy="debt-form-description"
      onClose={onClose}
      variant="drawer"
      panelClassName="max-w-[520px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Debt
          </p>
          <h2 id="debt-form-title" className="mt-1.5 text-xl font-bold text-foreground">
            Add a debt
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close debt form"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <p id="debt-form-description" className="mt-2 text-sm text-foreground-muted">
        This records a debt for planning only. It posts no transaction and changes no account
        balance.
      </p>

      <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5" noValidate>
        <Input
          id="debt-name"
          label="Name"
          type="text"
          placeholder="e.g. Amex revolve"
          value={values.name}
          onChange={(event) => update("name", event.target.value)}
          {...(errors["debt-name"] === undefined ? {} : { error: errors["debt-name"] })}
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="debt-kind"
            className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
          >
            Kind
          </label>
          <Select
            id="debt-kind"
            aria-label="Debt kind"
            options={DEBT_KIND_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label
            }))}
            value={values.kind}
            onChange={(next) => update("kind", asDebtKind(next))}
          />
        </div>

        {loanLiabilities.length === 0 ? null : (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="debt-linked-asset"
              className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
            >
              Link to a loan liability (optional)
            </label>
            <Select
              id="debt-linked-asset"
              aria-label="Linked loan liability"
              placeholder="Not linked — I will enter the amount"
              options={[
                { value: "", label: "Not linked — I will enter the amount" },
                ...loanLiabilities.map((asset) => ({ value: asset.id, label: asset.name }))
              ]}
              value={values.linkedAssetId}
              onChange={(next) => update("linkedAssetId", next)}
            />
            <p
              id="debt-linked-asset-hint"
              className="text-xs leading-relaxed text-foreground-muted"
            >
              A linked debt takes its outstanding amount from that asset&rsquo;s latest valuation,
              so there is only ever one number to keep up to date. Only open loan liabilities can be
              linked.
            </p>
          </div>
        )}

        {linked ? (
          <p className="rounded-xl border border-accent/25 bg-accent-glow/30 px-3.5 py-2.5 text-xs text-foreground-muted">
            The outstanding amount will come from the linked asset&rsquo;s latest valuation. Record
            a new valuation on the asset to change it.
          </p>
        ) : (
          <div>
            <AmountInput
              id="debt-outstanding"
              label="Outstanding amount"
              value={values.declaredOutstandingMinor}
              onChange={(minor) => update("declaredOutstandingMinor", minor)}
              {...(errors["debt-outstanding"] === undefined
                ? {}
                : { error: errors["debt-outstanding"] })}
            />
            <p className="mt-2 text-xs text-foreground-muted">
              Recorded as your estimate, and labelled as one everywhere it appears.
            </p>
          </div>
        )}

        <div>
          <Input
            id="debt-rate"
            label="Annual interest rate (%)"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 42"
            value={values.annualRatePercent}
            onChange={(event) => update("annualRatePercent", event.target.value)}
            aria-describedby="debt-rate-hint"
            {...(errors["debt-rate"] === undefined ? {} : { error: errors["debt-rate"] })}
          />
          <p id="debt-rate-hint" className="mt-1.5 text-xs text-foreground-muted">
            Enter the yearly rate as a percentage, for example 42 or 13.5.
          </p>
        </div>

        <div>
          <AmountInput
            id="debt-minimum-payment"
            label="Minimum monthly payment (optional)"
            value={values.minimumPaymentMinor}
            onChange={(minor) => update("minimumPaymentMinor", minor)}
            {...(errors["debt-minimum-payment"] === undefined
              ? {}
              : { error: errors["debt-minimum-payment"] })}
          />
          <p className="mt-2 text-xs text-foreground-muted">
            Leave it at zero to skip it. TreasuryOps does not schedule or make payments.
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
            {create.isPending ? "Saving…" : "Save debt"}
          </Button>
        </div>
      </form>
    </DialogSurface>
  );
}

/** The Select speaks strings; this narrows one back to a known debt kind. */
function asDebtKind(value: string): DebtFormValues["kind"] {
  const match = DEBT_KIND_OPTIONS.find((option) => option.value === value);
  return match?.value ?? "other";
}
