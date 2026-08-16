"use client";

import type { DeclaredDebt } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { userErrorMessage } from "@/lib/errors";

import { useUpdateDeclaredDebt } from "../hooks/use-debt-profile";

type ResolveDebtDialogProps = Readonly<{
  debt: DeclaredDebt;
  onClose: () => void;
  onResolved: (message: string) => void;
}>;

/**
 * Confirms removing a debt from active planning checks.
 *
 * The copy here is deliberate and must not drift: this action changes a
 * metadata status. It does not pay the debt, close a loan, post a transaction,
 * or alter an asset's valuation or your net worth. Saying otherwise would be a
 * lie the ledger cannot back up.
 */
export function ResolveDebtDialog({
  debt,
  onClose,
  onResolved
}: ResolveDebtDialogProps): ReactNode {
  const update = useUpdateDeclaredDebt();
  const [formError, setFormError] = useState<string | null>(null);

  async function resolve(): Promise<void> {
    setFormError(null);
    try {
      await update.mutateAsync({ debtId: debt.id, patch: { status: "resolved" } });
      onResolved(`${debt.name} removed from active planning checks.`);
      onClose();
    } catch (error: unknown) {
      setFormError(userErrorMessage(error, "Could not resolve this debt."));
    }
  }

  return (
    <DialogSurface
      labelledBy="resolve-debt-title"
      describedBy="resolve-debt-description"
      onClose={onClose}
      variant="dialog"
      panelClassName="max-w-[440px]"
    >
      <h2 id="resolve-debt-title" className="text-lg font-bold text-foreground">
        Remove “{debt.name}” from active planning?
      </h2>

      <div id="resolve-debt-description" className="mt-3 space-y-2.5 text-sm text-foreground-muted">
        <p>
          This stops the debt being counted in planning checks. It keeps the record, so you can
          still see it under resolved debts.
        </p>
        <p className="rounded-xl border border-border bg-surface-muted/60 px-3.5 py-2.5 text-xs leading-relaxed">
          This does not pay anything, post a transaction, or change an account balance.
          {debt.linkedAssetId === null
            ? " Your net worth is unaffected."
            : " The linked asset stays open with its valuations untouched, and your net worth is unaffected."}
        </p>
      </div>

      {formError === null ? null : (
        <p
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-expense/25 bg-expense/10 px-3 py-2 text-sm font-medium text-expense"
        >
          {formError}
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          disabled={update.isPending}
          onClick={onClose}
        >
          Keep it active
        </Button>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={update.isPending}
          onClick={() => void resolve()}
        >
          {update.isPending ? "Resolving…" : "Resolve debt record"}
        </Button>
      </div>
    </DialogSurface>
  );
}
