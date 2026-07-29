"use client";

import type { BillDetail } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
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
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid items-start justify-items-center overflow-y-auto overscroll-contain bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reconcile-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface-elevated p-6 shadow-glow-strong"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="reconcile-title" className="text-lg font-bold text-foreground">
            Mark statement reconciled?
          </h2>
          <button
            type="button"
            aria-label="Close reconciliation"
            onClick={onClose}
            className="text-foreground-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
          {detail.reconciliation.stats.matched} rows matched and{" "}
          {detail.reconciliation.stats.acknowledged} discrepancies acknowledged. This locks the
          statement review and unlocks payment.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={reconcile.isPending} onClick={() => void confirm()}>
            {reconcile.isPending ? "Reconciling…" : "Confirm reconciliation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
