"use client";

import type { Category, CategoryRule } from "@treasury-ops/shared";
import type { KeyboardEvent, ReactNode } from "react";

import { Select, type SelectOption } from "@/components/ui";

type CreateRuleRowProps = Readonly<{
  categories: readonly Category[];
  pattern: string;
  categoryId: string;
  existingRules?: readonly CategoryRule[] | undefined;
  isPending: boolean;
  onPatternChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSubmit: () => void;
}>;

export function CreateRuleRow({
  categories,
  pattern,
  categoryId,
  existingRules = [],
  isPending,
  onPatternChange,
  onCategoryChange,
  onSubmit
}: CreateRuleRowProps): ReactNode {
  function onPatternKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" && !isPending) {
      onSubmit();
    }
  }

  const trimmed = pattern.trim().toLowerCase();
  const exactDuplicate =
    trimmed !== ""
      ? existingRules.find((rule) => rule.pattern.toLowerCase() === trimmed)
      : undefined;

  const categoryOptions: readonly SelectOption[] = [
    { value: "", label: "Select a target category…" },
    ...categories.map((category) => ({
      value: category.id,
      label: `${category.name} (${category.kind})`
    }))
  ];

  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-4 sm:p-5 shadow-xs transition-colors duration-150 focus-within:border-accent/60">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded bg-accent/15 text-xs text-accent font-bold">
            +
          </span>
          <h3 className="font-mono text-2xs font-bold uppercase tracking-wider text-foreground">
            Create Automation Rule
          </h3>
        </div>
        <span className="text-2xs text-foreground-muted hidden sm:inline">
          Auto-assigns matching transaction descriptions
        </span>
      </div>

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <label htmlFor="new-rule-pattern" className="sr-only">
            New rule pattern
          </label>
          <div className="relative">
            <input
              id="new-rule-pattern"
              name="rulePattern"
              autoComplete="off"
              value={pattern}
              onChange={(event) => onPatternChange(event.target.value)}
              onKeyDown={onPatternKeyDown}
              maxLength={80}
              placeholder="Merchant keyword (e.g. netflix, uber, swiggy)…"
              aria-label="New rule pattern"
              className="min-h-11 w-full rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 font-mono text-base text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 sm:text-sm"
            />
            {pattern !== "" ? (
              <button
                type="button"
                onClick={() => onPatternChange("")}
                aria-label="Clear pattern"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground-muted hover:text-foreground"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>

        <span className="hidden font-mono text-base text-accent sm:inline" aria-hidden="true">
          →
        </span>

        <div className="w-full sm:w-64">
          <Select
            name="ruleCategoryId"
            aria-label="Category to assign"
            options={categoryOptions}
            value={categoryId}
            placeholder="Select a category"
            onChange={onCategoryChange}
          />
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending}
          className="min-h-11 w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground shadow-glow transition-all duration-150 hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-auto disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add rule"}
        </button>
      </div>

      {exactDuplicate !== undefined ? (
        <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
          ⚠️ Note: A rule matching &quot;{exactDuplicate.pattern}&quot; already exists.
        </p>
      ) : null}
    </div>
  );
}
