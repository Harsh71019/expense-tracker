"use client";

import type { ImportBatch } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";

type RevertConfirmDialogProps = Readonly<{
  batch: ImportBatch;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function RevertConfirmDialog({
  batch,
  isPending,
  onCancel,
  onConfirm
}: RevertConfirmDialogProps): ReactNode {
  return (
    <DialogSurface labelledBy="revert-batch-title" onClose={onCancel}>
      <h2 id="revert-batch-title" className="text-lg font-bold text-foreground">
        Revert this batch?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        This will reverse {batch.stats.committed} posted transactions from{" "}
        <strong className="text-foreground">{batch.filename}</strong>. The originals stay on record
        — reversing appends compensating entries. This can&apos;t be undone.
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className="w-full border border-expense/30 bg-expense/10 text-expense hover:bg-expense/15 sm:w-auto"
        >
          {isPending ? "Reversing…" : `Reverse ${batch.stats.committed} transactions`}
        </Button>
      </div>
    </DialogSurface>
  );
}
