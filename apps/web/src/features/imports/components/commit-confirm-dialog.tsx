"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

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
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="commit-import-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-elevated p-6 shadow-glow-strong animate-scale-up sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="commit-import-title" className="text-lg font-bold text-foreground">
          Commit this import?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          {includedCount} rows will post as real transactions tagged{" "}
          <strong className="text-foreground">csv_import</strong>. You can revert the whole batch
          later — it reverses the postings, it doesn&apos;t delete them.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Posting…" : `Post ${includedCount} transactions`}
          </Button>
        </div>
      </div>
    </div>
  );
}
