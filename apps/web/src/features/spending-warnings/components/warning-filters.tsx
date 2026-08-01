"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import {
  serializeSpendingWarningFilters,
  type SpendingWarningFilters,
  type WarningFilterValue
} from "../model/filters";

const OPTIONS: ReadonlyArray<{ value: WarningFilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "spikes", label: "Spending spikes" },
  { value: "large_expenses", label: "Large expenses" }
];

export function WarningFilters({
  filters
}: Readonly<{ filters: SpendingWarningFilters }>): ReactNode {
  const router = useRouter();

  function select(value: WarningFilterValue): void {
    const query = serializeSpendingWarningFilters({ filter: value });
    router.push(query === "" ? "/spending-warnings" : `/spending-warnings?${query}`);
  }

  return (
    <div role="group" aria-label="Filter spending patterns" className="mb-4 flex flex-wrap gap-2">
      {OPTIONS.map((option) => {
        const active = filters.filter === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => select(option.value)}
            className={`min-h-11 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? "border-accent bg-accent-glow text-foreground"
                : "border-border bg-surface-elevated text-foreground-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
