"use client";

import type { Category, CategoryRule } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";

type DeleteRuleDialogProps = Readonly<{
  rule: CategoryRule;
  category: Category | undefined;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function DeleteRuleDialog({
  rule,
  category,
  isPending,
  onCancel,
  onConfirm
}: DeleteRuleDialogProps): ReactNode {
  return (
    <DialogSurface labelledBy="delete-rule-title" onClose={onCancel}>
      <h2 id="delete-rule-title" className="text-lg font-bold text-foreground">
        Delete automation rule?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        Transactions containing{" "}
        <span className="font-mono font-semibold text-foreground">&quot;{rule.pattern}&quot;</span>{" "}
        will no longer be automatically mapped to{" "}
        <span className="font-semibold text-foreground">{category?.name ?? "this category"}</span>{" "}
        during import staging.
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
          {isPending ? "Deleting…" : "Delete rule"}
        </Button>
      </div>
    </DialogSurface>
  );
}
