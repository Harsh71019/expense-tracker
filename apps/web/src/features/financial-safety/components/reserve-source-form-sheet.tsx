"use client";

import type { ReserveSource } from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Money } from "@/components/ui/money";
import { userErrorMessage } from "@/lib/errors";

import { useUpdateReserveSource } from "../hooks/use-update-reserve-source";
import {
  initialReserveSourceFormValues,
  LIQUIDITY_TIER_OPTIONS,
  parseReserveSourceForm,
  previewEligibleMinor,
  type ReserveSourceFormValues
} from "../model/reserve-form";
import {
  getExclusionCopy,
  isRemovingLastEligibleSource,
  sourceTypeLabel
} from "../model/reserve-presentation";
import { LiquidityTierHelp } from "./liquidity-tier-help";

export interface ReserveSourceFormSheetProps {
  readonly source: ReserveSource;
  readonly allSources: readonly ReserveSource[];
  readonly onClose: () => void;
  readonly onSaved: (message: string) => void;
}

/**
 * Classifies one account or asset as an emergency reserve. This changes
 * planning metadata only: it never moves money, never changes an account
 * balance or asset valuation, and posts no ledger transaction.
 */
export function ReserveSourceFormSheet({
  source,
  allSources,
  onClose,
  onSaved
}: ReserveSourceFormSheetProps): ReactNode {
  const update = useUpdateReserveSource();
  const [values, setValues] = useState<ReserveSourceFormValues>(() =>
    initialReserveSourceFormValues(source)
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  const structurallyUnsupported =
    source.exclusionReason === "unsupported_account_type" ||
    source.exclusionReason === "unsupported_asset_kind" ||
    source.exclusionReason === "potential_double_count";

  function update_<K extends keyof ReserveSourceFormValues>(
    field: K,
    value: ReserveSourceFormValues[K]
  ): void {
    setValues((current) => ({ ...current, [field]: value }));
    setConfirmingRemoval(false);
  }

  const willRemainEligible = values.isIncluded && values.liquidityTier !== "locked";
  const removesLastEligible = isRemovingLastEligibleSource(
    allSources,
    source.sourceId,
    willRemainEligible
  );

  async function save(): Promise<void> {
    const parsed = parseReserveSourceForm(values);
    if (!parsed.ok) {
      setFormError(Object.values(parsed.errors)[0] ?? "Check the highlighted fields.");
      return;
    }

    setFormError(null);
    try {
      await update.mutateAsync({
        sourceKind: source.sourceKind,
        sourceId: source.sourceId,
        patch: parsed.value
      });
      onSaved("Reserve classification updated.");
      onClose();
    } catch (error: unknown) {
      setFormError(userErrorMessage(error, "Could not save this classification."));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (removesLastEligible && !confirmingRemoval) {
      setConfirmingRemoval(true);
      return;
    }
    await save();
  }

  const preview = previewEligibleMinor(source.currentValueMinor, values.eligibleCapMinor);
  const exclusion = getExclusionCopy(source.exclusionReason);

  return (
    <DialogSurface
      labelledBy="reserve-source-form-title"
      describedBy="reserve-source-form-description"
      onClose={onClose}
      variant="drawer"
      panelClassName="max-w-[520px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Emergency reserve
          </p>
          <h2 id="reserve-source-form-title" className="mt-1.5 text-xl font-bold text-foreground">
            {source.displayName}
          </h2>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {sourceTypeLabel(source.sourceType)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reserve classification form"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <p id="reserve-source-form-description" className="mt-2 text-sm text-foreground-muted">
        Classifying a source changes planning only. TreasuryOps does not move or lock your money.
      </p>

      {structurallyUnsupported ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-border/60 bg-surface-muted/40 px-3.5 py-2.5 text-xs text-foreground-muted"
        >
          {exclusion.label}. This source cannot be classified as an emergency reserve.
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5" noValidate>
          <div className="rounded-xl border border-border/60 bg-surface-muted/40 p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-foreground-muted">Current value</span>
              <span className="font-semibold text-foreground">
                {source.currentValueMinor === null ? (
                  "Unavailable"
                ) : (
                  <Money minor={Math.max(source.currentValueMinor, 0)} size="sm" />
                )}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-foreground-muted">Estimated eligible amount</span>
              <span className="font-semibold text-foreground">
                {preview === null ? "—" : <Money minor={preview} size="sm" />}
              </span>
            </div>
            <p className="mt-1.5 text-2xs text-foreground-muted">
              Estimate only, before freshness/eligibility checks. The saved classification will show
              the confirmed amount.
            </p>
          </div>

          <label className="flex min-h-11 items-center gap-2.5 text-sm text-foreground">
            <input
              id="reserve-source-included"
              type="checkbox"
              className="h-5 w-5 accent-accent"
              checked={values.isIncluded}
              onChange={(event) => update_("isIncluded", event.target.checked)}
            />
            Include this source as an emergency reserve
          </label>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="reserve-source-tier"
              className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
            >
              Liquidity tier
            </label>
            <Select
              id="reserve-source-tier"
              aria-label="Liquidity tier"
              options={LIQUIDITY_TIER_OPTIONS}
              value={values.liquidityTier}
              onChange={(next) => update_("liquidityTier", asTier(next))}
              disabled={!values.isIncluded}
            />
          </div>

          <LiquidityTierHelp />

          <div>
            <AmountInput
              id="reserve-source-cap"
              label="Eligible cap (optional)"
              value={values.eligibleCapMinor}
              onChange={(minor) => update_("eligibleCapMinor", minor)}
            />
            <p className="mt-2 text-xs text-foreground-muted">
              Leave it at zero to use the whole current value. A cap never changes the actual
              balance or valuation — only how much of it counts toward your reserve.
            </p>
          </div>

          {removesLastEligible && confirmingRemoval ? (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-accent/30 bg-accent-glow/30 px-3 py-2.5 text-sm text-foreground"
            >
              This is your only currently eligible reserve source. Saving will leave you with no
              eligible emergency reserve, and future runway estimates will become unavailable until
              you add another. Press Save again to confirm.
            </p>
          ) : null}

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
              disabled={update.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={update.isPending}>
              {update.isPending
                ? "Saving…"
                : removesLastEligible && confirmingRemoval
                  ? "Confirm and save"
                  : "Save"}
            </Button>
          </div>
        </form>
      )}
    </DialogSurface>
  );
}

function asTier(value: string): ReserveSourceFormValues["liquidityTier"] {
  const match = LIQUIDITY_TIER_OPTIONS.find((option) => option.value === value);
  return match?.value ?? "instant";
}
