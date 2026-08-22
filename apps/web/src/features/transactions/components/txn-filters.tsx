"use client";

import type { ListTransactionsQuery } from "@treasury-ops/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { DatePicker, Select } from "@/components/ui";
import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";

import {
  endOfISTDay,
  isSameISTDay,
  serializeTransactionFilters,
  startOfISTDay,
  toISTDateInputValue
} from "../model/filters";

const SEARCH_DEBOUNCE_MS = 400;
const UNCATEGORIZED_FILTER_VALUE = "__uncategorized__";

type DateFilterMode = "single" | "range";

export function TxnFilters({ filters }: Readonly<{ filters: ListTransactionsQuery }>): ReactNode {
  const router = useRouter();
  const accounts = useAccounts();
  const categories = useCategories();
  const [query, setQuery] = useState(filters.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const isSingleDateFilter =
    filters.from !== undefined &&
    filters.to !== undefined &&
    isSameISTDay(filters.from, filters.to);

  const [dateMode, setDateMode] = useState<DateFilterMode>(
    filters.from !== undefined && filters.to !== undefined && !isSingleDateFilter
      ? "range"
      : "single"
  );

  // Sync dateMode if filters change externally (e.g. URL navigation or preset)
  useEffect(() => {
    if (filters.from !== undefined && filters.to !== undefined) {
      setDateMode(isSameISTDay(filters.from, filters.to) ? "single" : "range");
    }
  }, [filters.from, filters.to]);

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

  const hasDateFilter = filters.from !== undefined || filters.to !== undefined;

  const activeFilterCount = [
    filters.q,
    filters.accountId,
    filters.categoryId,
    filters.uncategorized,
    hasDateFilter ? true : undefined
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

  function handleExactDateChange(val: string): void {
    if (val === "") {
      navigate({ from: undefined, to: undefined });
    } else {
      navigate({ from: startOfISTDay(val), to: endOfISTDay(val) });
    }
  }

  function applyPreset(
    preset: "today" | "yesterday" | "this-month" | "30-days" | "this-year"
  ): void {
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
      new Date()
    );

    if (preset === "today") {
      navigate({ from: startOfISTDay(todayStr), to: endOfISTDay(todayStr) });
      return;
    }

    if (preset === "yesterday") {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yesterdayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        yesterday
      );
      navigate({ from: startOfISTDay(yesterdayStr), to: endOfISTDay(yesterdayStr) });
      return;
    }

    const [yStr, mStr] = todayStr.split("-");
    const year = yStr ?? "2026";
    const month = mStr ?? "01";

    let fromDate: Date | undefined;
    if (preset === "this-month") {
      fromDate = startOfISTDay(`${year}-${month}-01`);
    } else if (preset === "30-days") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgoStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata"
      }).format(thirtyDaysAgo);
      fromDate = startOfISTDay(thirtyDaysAgoStr);
    } else {
      fromDate = startOfISTDay(`${year}-01-01`);
    }

    navigate({ from: fromDate, to: endOfISTDay(todayStr) });
  }

  const dateBadgeLabel = (() => {
    if (filters.from === undefined && filters.to === undefined) return null;
    const fromStr = toISTDateInputValue(filters.from);
    const toStr = toISTDateInputValue(filters.to);

    if (fromStr !== "" && toStr !== "" && fromStr === toStr) {
      return `Date: ${fromStr}`;
    }
    if (fromStr !== "" && toStr !== "") {
      return `Date: ${fromStr} → ${toStr}`;
    }
    if (fromStr !== "") {
      return `Date: From ${fromStr}`;
    }
    return `Date: Up to ${toStr}`;
  })();

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

        {/* Date Mode Toggle & Pickers */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-xl border border-border bg-surface-muted/70 p-0.5">
            <button
              type="button"
              aria-label="Exact date mode"
              aria-pressed={dateMode === "single"}
              onClick={() => setDateMode("single")}
              className={`rounded-lg px-2.5 py-1 font-mono text-2xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                dateMode === "single"
                  ? "bg-surface-elevated text-accent shadow-xs"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              Single date
            </button>
            <button
              type="button"
              aria-label="Date range mode"
              aria-pressed={dateMode === "range"}
              onClick={() => setDateMode("range")}
              className={`rounded-lg px-2.5 py-1 font-mono text-2xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                dateMode === "range"
                  ? "bg-surface-elevated text-accent shadow-xs"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              Range
            </button>
          </div>

          {dateMode === "single" ? (
            <DatePicker
              name="transactionExactDate"
              aria-label="Filter by date"
              placeholder="Filter by date"
              clearable
              value={toISTDateInputValue(filters.from)}
              onChange={handleExactDateChange}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                name="transactionFrom"
                aria-label="From date"
                placeholder="From date"
                clearable
                value={toISTDateInputValue(filters.from)}
                onChange={(val) => navigate({ from: startOfISTDay(val) })}
              />
              <DatePicker
                name="transactionTo"
                aria-label="To date"
                placeholder="To date"
                clearable
                value={toISTDateInputValue(filters.to)}
                onChange={(val) => navigate({ to: endOfISTDay(val) })}
              />
            </div>
          )}
        </div>

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
          onClick={() => applyPreset("today")}
          className="rounded-lg border border-border/60 bg-surface-muted/50 px-2.5 py-1 text-2xs font-semibold text-foreground-muted transition-colors hover:border-accent/40 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => applyPreset("yesterday")}
          className="rounded-lg border border-border/60 bg-surface-muted/50 px-2.5 py-1 text-2xs font-semibold text-foreground-muted transition-colors hover:border-accent/40 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Yesterday
        </button>
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
          {dateBadgeLabel !== null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
              <span>{dateBadgeLabel}</span>
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
