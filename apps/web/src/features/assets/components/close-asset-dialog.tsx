"use client";

import type { Asset } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type CloseAssetDialogProps = Readonly<{
  asset: Asset;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function CloseAssetDialog({
  asset,
  isPending,
  onCancel,
  onConfirm
}: CloseAssetDialogProps): ReactNode {
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid items-start justify-items-center overflow-y-auto overscroll-contain bg-black/60 p-4 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-asset-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface-elevated p-6 shadow-glow-strong animate-scale-up sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="close-asset-title" className="text-lg font-bold text-foreground">
          Close {asset.name}?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          Use this when a loan is repaid or an FD has matured and been withdrawn. It drops out of
          your net worth and asset list. Its valuation history goes with it and can&apos;t be
          reopened.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="border border-expense/30 bg-expense/10 text-expense hover:bg-expense/15"
          >
            {isPending ? "Closing…" : "Close asset"}
          </Button>
        </div>
      </div>
    </div>
  );
}
