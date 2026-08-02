"use client";

import {
  parseMinor,
  UpsertBudgetSchema,
  type BudgetProgress,
  type Category
} from "@treasury-ops/shared";
import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput, evaluateMathExpression } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { Money } from "@/components/ui/money";
import { Select } from "@/components/ui/select";

import { useUpsertBudget } from "../hooks/use-budget-mutations";

type BudgetFormProps = Readonly<{
  categories: readonly Category[];
  budgets: readonly BudgetProgress[];
  initialProgress?: BudgetProgress;
  onClose: () => void;
  onSaved: (message: string) => void;
}>;

export function BudgetForm({
  categories,
  budgets,
  initialProgress,
  onClose,
  onSaved
}: BudgetFormProps): ReactNode {
  const upsert = useUpsertBudget();
  const inputRef = useRef<HTMLInputElement>(null);
  const [categoryId, setCategoryId] = useState(initialProgress?.category.id ?? "");
  const [limitMinor, setLimitMinor] = useState(initialProgress?.budget.limitMinor ?? 0);
  const [error, setError] = useState<string>();
  const selectedExisting = budgets.find((progress) => progress.category.id === categoryId);
  const isEdit = initialProgress !== undefined || selectedExisting !== undefined;

  function selectCategory(nextCategoryId: string): void {
    setCategoryId(nextCategoryId);
    const existing = budgets.find((progress) => progress.category.id === nextCategoryId);
    setLimitMinor(existing?.budget.limitMinor ?? 0);
    setError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (categoryId === "") {
      setError("Choose an expense category.");
      return;
    }

    let submittedMinor: number;
    try {
      submittedMinor = parseMinor(evaluateMathExpression(inputRef.current?.value ?? ""));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Enter a valid monthly limit.");
      return;
    }

    const parsed = UpsertBudgetSchema.safeParse({ limitMinor: submittedMinor });
    if (!parsed.success) {
      setError("Monthly limit must be greater than zero.");
      return;
    }

    try {
      await upsert.mutateAsync({ categoryId, input: parsed.data });
      const category = categories.find((item) => item.id === categoryId);
      onSaved(`${category?.name ?? "Budget"} ${isEdit ? "updated" : "created"}.`);
      onClose();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not save this budget.");
    }
  }

  return (
    <DialogSurface
      labelledBy="budget-editor-title"
      onClose={onClose}
      variant="drawer"
      panelClassName="max-w-[520px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-accent uppercase">
            Monthly planning
          </p>
          <h2 id="budget-editor-title" className="mt-1.5 text-xl font-bold text-foreground">
            {isEdit ? "Edit budget" : "Add budget"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close budget form"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-5">
        <div className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.22em] text-foreground-muted uppercase">
          <span>Expense category</span>
          <Select
            aria-label="Expense category"
            name="categoryId"
            options={[
              { value: "", label: "Choose a category" },
              ...categories.map((category) => {
                const hasBudget = budgets.some((progress) => progress.category.id === category.id);
                return {
                  value: category.id,
                  label: `${category.name}${hasBudget ? " (edit existing)" : ""}`
                };
              })
            ]}
            placeholder="Choose a category"
            value={categoryId}
            disabled={initialProgress !== undefined}
            onChange={selectCategory}
          />
        </div>

        {selectedExisting === undefined ? null : (
          <p className="rounded-lg border border-border bg-surface-muted p-3 text-sm text-foreground-muted">
            Current posted spend:{" "}
            <Money minor={selectedExisting.spentMinor} size="sm" className="text-foreground" />.
            Saving immediately recalculates utilization.
          </p>
        )}

        <AmountInput
          id="budget-limit"
          label="Monthly limit"
          value={limitMinor}
          onChange={setLimitMinor}
          inputRef={inputRef}
          {...(error === undefined ? {} : { error })}
        />

        <p className="rounded-lg border border-border bg-surface-muted p-3 text-xs leading-relaxed text-foreground-muted">
          Posted expenses assigned directly to this category count from the first day of the current
          month. Transfers and reversed transactions do not count.
        </p>

        <div className="safe-area-bottom sticky bottom-0 -mx-5 flex flex-col-reverse gap-2 border-t border-border bg-surface-elevated px-5 pt-4 pb-4 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-2 sm:pb-0">
          <Button
            type="button"
            className="w-full sm:w-auto"
            variant="secondary"
            disabled={upsert.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={upsert.isPending || categories.length === 0}
          >
            {upsert.isPending ? "Saving…" : isEdit ? "Save changes" : "Add budget"}
          </Button>
        </div>
      </form>
    </DialogSurface>
  );
}
