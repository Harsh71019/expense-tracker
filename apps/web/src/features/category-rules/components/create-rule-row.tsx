"use client";

import type { Category } from "@treasury-ops/shared";
import type { KeyboardEvent, ReactNode } from "react";

const selectClasses =
  "rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

type CreateRuleRowProps = Readonly<{
  categories: readonly Category[];
  pattern: string;
  categoryId: string;
  isPending: boolean;
  onPatternChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSubmit: () => void;
}>;

export function CreateRuleRow({
  categories,
  pattern,
  categoryId,
  isPending,
  onPatternChange,
  onCategoryChange,
  onSubmit
}: CreateRuleRowProps): ReactNode {
  function onPatternKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") onSubmit();
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[13px] border border-dashed border-border bg-surface-elevated px-4 py-3.5">
      <span className="font-mono text-[13px] font-semibold tracking-wide text-foreground-muted uppercase">
        Contains
      </span>
      <input
        value={pattern}
        onChange={(event) => onPatternChange(event.target.value)}
        onKeyDown={onPatternKeyDown}
        maxLength={80}
        placeholder="text to look for"
        aria-label="New rule pattern"
        className="min-w-40 flex-1 rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 font-mono text-sm text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      <span className="font-mono text-base text-accent" aria-hidden="true">
        →
      </span>
      <select
        value={categoryId}
        onChange={(event) => onCategoryChange(event.target.value)}
        aria-label="Category to assign"
        className={selectClasses}
      >
        <option value="">Select a category</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name} · {category.kind}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onSubmit}
        disabled={isPending}
        className="rounded-lg bg-accent px-4.5 py-2.5 text-sm font-semibold text-accent-foreground shadow-glow transition-colors duration-150 hover:bg-accent-strong disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add rule"}
      </button>
    </div>
  );
}
