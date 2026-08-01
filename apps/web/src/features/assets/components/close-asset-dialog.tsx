"use client";

import type { Asset } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";

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
    <DialogSurface labelledBy="close-asset-title" onClose={onCancel} role="alertdialog">
      <h2 id="close-asset-title" className="text-lg font-bold text-foreground">
        Close {asset.name}?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        Use this when a loan is repaid or an FD has matured and been withdrawn. It drops out of your
        net worth and asset list. Its valuation history goes with it and can&apos;t be reopened.
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" className="w-full sm:w-auto" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          className="w-full border border-expense/30 bg-expense/10 text-expense hover:bg-expense/15 sm:w-auto"
          onClick={onConfirm}
          disabled={isPending}
        >
          {isPending ? "Closing…" : "Close asset"}
        </Button>
      </div>
    </DialogSurface>
  );
}
