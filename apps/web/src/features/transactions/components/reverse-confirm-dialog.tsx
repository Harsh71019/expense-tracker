"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type ReverseConfirmDialogProps = Readonly<{
  title: string;
  body: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}>;

export function ReverseConfirmDialog({
  title,
  body,
  onCancel,
  onConfirm,
  isPending
}: ReverseConfirmDialogProps): ReactNode {
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reverse-confirm-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-elevated p-6 shadow-glow-strong animate-scale-up sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="reverse-confirm-title" className="text-lg font-bold text-foreground">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15"
          >
            {isPending ? "Posting reversal…" : "↺ Post reversal"}
          </Button>
        </div>
      </div>
    </div>
  );
}
