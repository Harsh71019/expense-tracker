"use client";

import type { BudgetProgress } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type ArchiveBudgetDialogProps = Readonly<{
  progress: BudgetProgress;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function ArchiveBudgetDialog({
  progress,
  isPending,
  onCancel,
  onConfirm
}: ArchiveBudgetDialogProps): ReactNode {
  return (
    <div className="fixed inset-0 z-50 grid items-start justify-items-center overflow-y-auto overscroll-contain bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="archive-budget-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface-elevated p-6 shadow-2xl"
      >
        <h2 id="archive-budget-title" className="text-xl font-bold text-foreground">
          Archive {progress.category.name} budget?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          It will stop appearing in current totals and threshold checks. Transactions are not
          changed.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={isPending} onClick={onCancel}>
            Keep budget
          </Button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="rounded-lg bg-expense px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isPending ? "Archiving…" : "Archive budget"}
          </button>
        </div>
      </div>
    </div>
  );
}
