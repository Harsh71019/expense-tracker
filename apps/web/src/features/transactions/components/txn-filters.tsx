"use client";

import type { ListTransactionsQuery } from "@treasury-ops/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { DatePicker, Select } from "@/components/ui";
import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";

import { serializeTransactionFilters } from "../model/filters";

const SEARCH_DEBOUNCE_MS = 400;
const UNCATEGORIZED_FILTER_VALUE = "__uncategorized__";

function toDateInputValue(value: Date | undefined): string {
  return value === undefined ? "" : value.toISOString().slice(0, 10);
}

function parseDate(value: string): Date | undefined {
  return value === "" ? undefined : new Date(`${value}T00:00:00.000Z`);
}

export function TxnFilters({ filters }: Readonly<{ filters: ListTransactionsQuery }>): ReactNode {
  const router = useRouter();
  const accounts = useAccounts();
  const categories = useCategories();
  const [query, setQuery] = useState(filters.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Re-syncs from the URL when it changes out from under us (e.g. Clear, back button) —
  // deliberately excludes `query` itself so this doesn't fight the debounce below.
  useEffect(() => {
    setQuery(filters.q ?? "");
  }, [filters.q]);

  function navigate(overrides: Partial<ListTransactionsQuery>): void {
    const next = serializeTransactionFilters({ ...filters, ...overrides, cursor: undefined });
    router.push(next === "" ? "/transactions" : `/transactions?${next}`);
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === (filters.q ?? "")) return;
    const timeout = setTimeout(() => {
      const next = serializeTransactionFilters({
        ...filters,
        q: trimmed === "" ? undefined : trimmed,
        cursor: undefined
      });
      router.push(next === "" ? "/transactions" : `/transactions?${next}`);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [filters, query, router]);

  const activeFilterCount = [
    filters.q,
    filters.accountId,
    filters.categoryId,
    filters.uncategorized,
    filters.from,
    filters.to
  ].filter((value) => value !== undefined).length;

  const isFiltered = activeFilterCount > 0;

  function clear(): void {
    setQuery("");
    setFiltersOpen(false);
    router.push("/transactions");
  }

  // Keyboard shortcut: Press Escape to clear active filters when not in a modal or input
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && isFiltered && !event.defaultPrevented) {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        const activeDialog = document.activeElement?.closest('[role="dialog"], [role="menu"]');
        if (
          activeTag === "input" ||
          activeTag === "select" ||
          activeTag === "textarea" ||
          activeDialog !== null
        ) {
          return;
        }
        setQuery("");
        router.push("/transactions");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFiltered, router]);

  const accountOptions = [
    { value: "", label: "All accounts" },
    ...(filters.accountId !== undefined &&
    !(accounts.data ?? []).some((account) => account.id === filters.accountId)
      ? [{ value: filters.accountId, label: "Archived or unavailable" }]
      : []),
    ...(accounts.data ?? []).map((account) => ({
      value: account.id,
      label: account.name
    }))
  ];

  const categoryOptions = [
    { value: "", label: "All categories" },
    { value: UNCATEGORIZED_FILTER_VALUE, label: "Uncategorized" },
    ...(filters.categoryId !== undefined &&
    !(categories.data ?? []).some((category) => category.id === filters.categoryId)
      ? [{ value: filters.categoryId, label: "Archived or unavailable" }]
      : []),
    ...(categories.data ?? []).map((category) => ({
      value: category.id,
      label: category.name
    }))
  ];

  function handleCategoryFilterChange(value: string): void {
    navigate({
      categoryId: value === "" || value === UNCATEGORIZED_FILTER_VALUE ? undefined : value,
      uncategorized: value === UNCATEGORIZED_FILTER_VALUE ? true : undefined
    });
  }

  function applyPreset(preset: "this-month" | "30-days" | "this-year"): void {
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
      new Date()
    );
    const [yStr, mStr, dStr] = todayStr.split("-");
    const year = Number(yStr);
    const month = (Number(mStr) || 1) - 1;
    const day = Number(dStr) || 1;
    const today = new Date(Date.UTC(year, month, day));

    let fromDate: Date;
    if (preset === "this-month") {
      fromDate = new Date(Date.UTC(year, month, 1));
    } else if (preset === "30-days") {
      fromDate = new Date(Date.UTC(year, month, day - 30));
    } else {
      fromDate = new Date(Date.UTC(year, 0, 1));
    }

    navigate({ from: fromDate, to: today });
  }

  return (
    <div
      className={`relative z-10 mb-5 flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
        isFiltered
          ? "border-accent/40 bg-surface-elevated/90 shadow-sm"
          : "border-border/80 bg-surface-elevated/90"
      }`}
    >
      <div className="flex min-w-0 flex-1 basis-full items-center gap-2.5 rounded-xl border border-border/80 bg-surface-muted/60 px-3.5 transition-colors focus-within:border-accent/60 focus-within:bg-surface-muted focus-within:ring-2 focus-within:ring-accent/20 sm:min-w-56 sm:basis-auto">
        <span className="text-foreground-muted/70 text-sm font-semibold" aria-hidden="true">
          ⌕
        </span>
        <input
          value={query}
          name="transactionSearch"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search description…"
          aria-label="Search description"
          className="min-h-10 w-full bg-transparent py-2 text-base text-foreground outline-none placeholder:text-foreground-muted/60 sm:text-sm"
        />
        {query !== "" && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search input"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-foreground-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ✕
          </button>
        )}
      </div>

      <button
        type="button"
        aria-controls="transaction-filter-controls"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((isOpen) => !isOpen)}
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border bg-surface-muted px-3.5 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:hidden"
      >
        <span>Filters</span>
        <span className="flex items-center gap-2 text-foreground-muted">
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 font-mono text-xs text-accent">
              {activeFilterCount}
            </span>
          ) : null}
          <span aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
        </span>
      </button>

      <div
        id="transaction-filter-controls"
        className={`${filtersOpen ? "grid" : "hidden"} w-full grid-cols-1 gap-2.5 border-t border-border/70 pt-3 sm:contents`}
      >
        <Select
          aria-label="Filter by account"
          name="transactionAccount"
          options={accountOptions}
          value={filters.accountId ?? ""}
          onChange={(value) => navigate({ accountId: value === "" ? undefined : value })}
        />
        <Select
          aria-label="Filter by category"
          name="transactionCategory"
          options={categoryOptions}
          value={
            filters.uncategorized === true ? UNCATEGORIZED_FILTER_VALUE : (filters.categoryId ?? "")
          }
          onChange={handleCategoryFilterChange}
        />
        <DatePicker
          name="transactionFrom"
          aria-label="From date"
          placeholder="From date"
          clearable
          value={toDateInputValue(filters.from)}
          onChange={(val) => navigate({ from: parseDate(val) })}
        />
        <DatePicker
          name="transactionTo"
          aria-label="To date"
          placeholder="To date"
          clearable
          value={toDateInputValue(filters.to)}
          onChange={(val) => navigate({ to: parseDate(val) })}
        />

        {isFiltered ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear"
            title="Clear all filters (Esc)"
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-surface-muted/60 px-3.5 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:border-expense/40 hover:bg-expense/10 hover:text-expense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span>Clear</span>
            <span className="rounded-full bg-accent/20 px-1.5 py-0.5 font-mono text-2xs text-accent">
              {activeFilterCount}
            </span>
          </button>
        ) : null}
      </div>

      {/* Quick Date Presets */}
      <div className="flex w-full flex-wrap items-center gap-1.5 pt-1">
        <span className="font-mono text-2xs font-semibold text-foreground-muted uppercase">
          Quick dates:
        </span>
        <button
          type="button"
          onClick={() => applyPreset("this-month")}
          className="rounded-lg border border-border/60 bg-surface-muted/50 px-2.5 py-1 text-2xs font-semibold text-foreground-muted transition-colors hover:border-accent/40 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          This Month
        </button>
        <button
          type="button"
          onClick={() => applyPreset("30-days")}
          className="rounded-lg border border-border/60 bg-surface-muted/50 px-2.5 py-1 text-2xs font-semibold text-foreground-muted transition-colors hover:border-accent/40 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Last 30 Days
        </button>
        <button
          type="button"
          onClick={() => applyPreset("this-year")}
          className="rounded-lg border border-border/60 bg-surface-muted/50 px-2.5 py-1 text-2xs font-semibold text-foreground-muted transition-colors hover:border-accent/40 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          This Year
        </button>
      </div>

      {/* Active Filter Badges */}
      {isFiltered && (
        <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
          <span className="font-mono text-2xs font-semibold text-foreground-muted uppercase">
            Active:
          </span>
          {filters.q !== undefined && filters.q !== "" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
              <span>Search: &quot;{filters.q}&quot;</span>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="hover:text-foreground focus-visible:outline-none"
                aria-label="Remove search filter"
              >
                ×
              </button>
            </span>
          )}
          {filters.accountId !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
              <span>
                Account:{" "}
                {(accounts.data ?? []).find((a) => a.id === filters.accountId)?.name ?? "Selected"}
              </span>
              <button
                type="button"
                onClick={() => navigate({ accountId: undefined })}
                className="hover:text-foreground focus-visible:outline-none"
                aria-label="Remove account filter"
              >
                ×
              </button>
            </span>
          )}
          {(filters.categoryId !== undefined || filters.uncategorized === true) && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
              <span>
                Category:{" "}
                {filters.uncategorized === true
                  ? "Uncategorized"
                  : ((categories.data ?? []).find((c) => c.id === filters.categoryId)?.name ??
                    "Selected")}
              </span>
              <button
                type="button"
                onClick={() => navigate({ categoryId: undefined, uncategorized: undefined })}
                className="hover:text-foreground focus-visible:outline-none"
                aria-label="Remove category filter"
              >
                ×
              </button>
            </span>
          )}
          {(filters.from !== undefined || filters.to !== undefined) && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
              <span>
                Date: {toDateInputValue(filters.from) || "Any"} →{" "}
                {toDateInputValue(filters.to) || "Any"}
              </span>
              <button
                type="button"
                onClick={() => navigate({ from: undefined, to: undefined })}
                className="hover:text-foreground focus-visible:outline-none"
                aria-label="Remove date filter"
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
