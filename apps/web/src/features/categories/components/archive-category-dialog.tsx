"use client";

import type { Category } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";

type ArchiveCategoryDialogProps = Readonly<{
  category: Category;
  hasChildren: boolean;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function ArchiveCategoryDialog({
  category,
  hasChildren,
  isPending,
  onCancel,
  onConfirm
}: ArchiveCategoryDialogProps): ReactNode {
  return (
    <DialogSurface labelledBy="archive-category-title" onClose={onCancel}>
      <h2 id="archive-category-title" className="text-lg font-bold text-foreground">
        Archive {category.name}?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        {hasChildren ? "This is a parent with subcategories. " : ""}
        Existing transactions keep their history, but this category can&apos;t be picked for new
        ones. This can&apos;t be undone.
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
          {isPending ? "Archiving…" : "Archive category"}
        </Button>
      </div>
    </DialogSurface>
  );
}
