"use client";

import type { ImportBatch } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";

type DeleteConfirmDialogProps = Readonly<{
  batch: ImportBatch;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function DeleteConfirmDialog({
  batch,
  isPending,
  onCancel,
  onConfirm
}: DeleteConfirmDialogProps): ReactNode {
  return (
    <DialogSurface labelledBy="delete-batch-title" onClose={onCancel}>
      <h2 id="delete-batch-title" className="text-lg font-bold text-foreground">
        Delete this import?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        This removes <strong className="text-foreground">{batch.filename}</strong> and its staged
        rows. Nothing from it was ever posted to your ledger, so there&apos;s nothing to reverse —
        this just discards the upload. This can&apos;t be undone.
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
          {isPending ? "Deleting…" : "Delete import"}
        </Button>
      </div>
    </DialogSurface>
  );
}
