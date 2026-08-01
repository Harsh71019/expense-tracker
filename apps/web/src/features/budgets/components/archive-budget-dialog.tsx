"use client";

import type { BudgetProgress } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";

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
    <DialogSurface
      labelledBy="archive-budget-title"
      onClose={onCancel}
      role="alertdialog"
      panelClassName="max-w-md"
    >
      <h2 id="archive-budget-title" className="text-xl font-bold text-foreground">
        Archive {progress.category.name} budget?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        It will stop appearing in current totals and threshold checks. Transactions are not changed.
      </p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          className="w-full sm:w-auto"
          variant="secondary"
          disabled={isPending}
          onClick={onCancel}
        >
          Keep budget
        </Button>
        <button
          type="button"
          disabled={isPending}
          onClick={onConfirm}
          className="min-h-11 w-full rounded-lg bg-expense px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense sm:w-auto disabled:opacity-50"
        >
          {isPending ? "Archiving…" : "Archive budget"}
        </button>
      </div>
    </DialogSurface>
  );
}
