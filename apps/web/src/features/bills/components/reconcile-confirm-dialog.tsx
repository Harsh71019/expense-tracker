"use client";

import type { BillDetail } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import { useReconcileBill } from "../hooks/use-bill-reconciliation";

export function ReconcileConfirmDialog({
  detail,
  onClose
}: Readonly<{ detail: BillDetail; onClose: () => void }>): ReactNode {
  const reconcile = useReconcileBill(detail.bill.id);

  async function confirm(): Promise<void> {
    try {
      await reconcile.mutateAsync();
      toast.success("Statement reconciled");
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not reconcile this statement.");
    }
  }

  return (
    <DialogSurface labelledBy="reconcile-title" onClose={onClose} panelClassName="max-w-md">
      <div className="flex items-start justify-between gap-3">
        <h2 id="reconcile-title" className="text-lg font-bold text-foreground">
          Mark statement reconciled?
        </h2>
        <button
          type="button"
          aria-label="Close reconciliation"
          onClick={onClose}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
        {detail.reconciliation.stats.matched} rows matched and{" "}
        {detail.reconciliation.stats.acknowledged} discrepancies acknowledged. This locks the
        statement review and unlocks payment.
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="w-full sm:w-auto"
          type="button"
          disabled={reconcile.isPending}
          onClick={() => void confirm()}
        >
          {reconcile.isPending ? "Reconciling…" : "Confirm reconciliation"}
        </Button>
      </div>
    </DialogSurface>
  );
}
