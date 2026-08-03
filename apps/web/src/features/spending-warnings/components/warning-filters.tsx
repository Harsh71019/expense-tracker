"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Select, type SelectOption } from "@/components/ui";

import {
  serializeSpendingWarningFilters,
  type SpendingWarningFilters,
  type WarningFilterValue
} from "../model/filters";

const OPTIONS: readonly SelectOption[] = [
  { value: "all", label: "All patterns" },
  { value: "spikes", label: "Spending spikes" },
  { value: "large_expenses", label: "Large expenses" }
];

export function WarningFilters({
  filters
}: Readonly<{ filters: SpendingWarningFilters }>): ReactNode {
  const router = useRouter();

  function select(value: string): void {
    const filterVal: WarningFilterValue =
      value === "spikes" || value === "large_expenses" ? value : "all";
    const query = serializeSpendingWarningFilters({ filter: filterVal });
    router.push(query === "" ? "/spending-warnings" : `/spending-warnings?${query}`);
  }

  const isFiltered = filters.filter !== "all";

  return (
    <div
      role="group"
      aria-label="Filter spending patterns"
      className={`mb-5 flex flex-wrap items-center gap-3.5 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
        isFiltered
          ? "border-accent/40 bg-surface-elevated/90 shadow-sm"
          : "border-border/80 bg-surface-elevated/90"
      }`}
    >
      <Select
        aria-label="Filter pattern type"
        name="patternFilter"
        options={OPTIONS}
        value={filters.filter}
        onChange={select}
      />

      {isFiltered ? (
        <button
          type="button"
          onClick={() => select("all")}
          aria-label="Clear"
          title="Clear filters"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface-muted/60 px-3 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:border-expense/40 hover:bg-expense/10 hover:text-expense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span>Clear</span>
        </button>
      ) : null}
    </div>
  );
}
