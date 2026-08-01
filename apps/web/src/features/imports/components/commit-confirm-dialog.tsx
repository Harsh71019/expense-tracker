"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";

type CommitConfirmDialogProps = Readonly<{
  includedCount: number;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function CommitConfirmDialog({
  includedCount,
  isPending,
  onCancel,
  onConfirm
}: CommitConfirmDialogProps): ReactNode {
  return (
    <DialogSurface labelledBy="commit-import-title" onClose={onCancel}>
      <h2 id="commit-import-title" className="text-lg font-bold text-foreground">
        Commit this import?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        {includedCount} rows will post as real transactions tagged{" "}
        <strong className="text-foreground">csv_import</strong>. You can revert the whole batch
        later — it reverses the postings, it doesn&apos;t delete them.
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="w-full sm:w-auto" type="button" onClick={onConfirm} disabled={isPending}>
          {isPending ? "Posting…" : `Post ${includedCount} transactions`}
        </Button>
      </div>
    </DialogSurface>
  );
}
