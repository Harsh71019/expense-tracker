"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";

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
    <DialogSurface labelledBy="reverse-confirm-title" onClose={onCancel}>
      <h2 id="reverse-confirm-title" className="text-lg font-bold text-foreground">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{body}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className="w-full border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15 sm:w-auto"
        >
          {isPending ? "Posting reversal…" : "↺ Post reversal"}
        </Button>
      </div>
    </DialogSurface>
  );
}
