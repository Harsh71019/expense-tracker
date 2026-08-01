"use client";

import type { Goal } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";

type AbandonGoalDialogProps = Readonly<{
  goal: Goal;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function AbandonGoalDialog({
  goal,
  isPending,
  onCancel,
  onConfirm
}: AbandonGoalDialogProps): ReactNode {
  return (
    <DialogSurface
      labelledBy="abandon-goal-title"
      onClose={onCancel}
      role="alertdialog"
      panelClassName="max-w-md"
    >
      <h2 id="abandon-goal-title" className="text-xl font-bold text-foreground">
        Abandon “{goal.name}”?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        Its history stays intact, but the goal leaves your active plan. This cannot be undone.
      </p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          className="w-full sm:w-auto"
          variant="secondary"
          disabled={isPending}
          onClick={onCancel}
        >
          Keep goal
        </Button>
        <button
          type="button"
          disabled={isPending}
          onClick={onConfirm}
          className="min-h-11 w-full rounded-lg bg-expense px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense sm:w-auto disabled:opacity-50"
        >
          {isPending ? "Abandoning…" : "Abandon goal"}
        </button>
      </div>
    </DialogSurface>
  );
}
