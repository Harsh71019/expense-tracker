"use client";

import type { Category } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";

type PermanentDeleteCategoryDialogProps = Readonly<{
  category: Category;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function PermanentDeleteCategoryDialog({
  category,
  isPending,
  onCancel,
  onConfirm
}: PermanentDeleteCategoryDialogProps): ReactNode {
  return (
    <DialogSurface
      role="alertdialog"
      labelledBy="permanent-delete-category-title"
      onClose={onCancel}
    >
      <h2 id="permanent-delete-category-title" className="text-lg font-bold text-foreground">
        Permanently delete {category.name}?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        This cannot be undone. Deletion is blocked if the category has subcategories, transactions,
        budgets, rules, imports, or other linked records.
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
          {isPending ? "Deleting…" : "Delete permanently"}
        </Button>
      </div>
    </DialogSurface>
  );
}
