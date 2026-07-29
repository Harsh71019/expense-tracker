"use client";

import type { Category } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

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
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid items-start justify-items-center overflow-y-auto overscroll-contain bg-black/60 p-4 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-category-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface-elevated p-6 shadow-glow-strong animate-scale-up sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="archive-category-title" className="text-lg font-bold text-foreground">
          Archive {category.name}?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          {hasChildren ? "This is a parent with subcategories. " : ""}
          Existing transactions keep their history, but this category can&apos;t be picked for new
          ones. This can&apos;t be undone.
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
            {isPending ? "Archiving…" : "Archive category"}
          </Button>
        </div>
      </div>
    </div>
  );
}
