"use client";

import type { ListTransactionsQuery } from "@treasury-ops/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";

import { serializeTransactionFilters } from "../model/filters";

const SEARCH_DEBOUNCE_MS = 400;

function toDateInputValue(value: Date | undefined): string {
  return value === undefined ? "" : value.toISOString().slice(0, 10);
}

function parseDate(value: string): Date | undefined {
  return value === "" ? undefined : new Date(`${value}T00:00:00.000Z`);
}

const selectClasses =
  "min-h-11 w-full rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-base font-medium text-foreground outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent/30 sm:w-auto sm:text-sm";

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

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border p-3 transition-colors duration-150 ${
        isFiltered
          ? "border-accent/40 bg-surface-elevated shadow-sm"
          : "border-border bg-surface-elevated"
      }`}
    >
      <div className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 sm:min-w-52 sm:basis-auto">
        <span className="text-foreground-muted" aria-hidden="true">
          ⌕
        </span>
        <input
          value={query}
          name="transactionSearch"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search description…"
          aria-label="Search description"
          className="min-h-11 w-full bg-transparent py-2.5 text-base text-foreground outline-none placeholder:text-foreground-muted/60 sm:text-sm"
        />
        {query !== "" && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search input"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xs text-foreground-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
        className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border bg-surface-muted px-3 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:hidden"
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
        className={`${filtersOpen ? "grid" : "hidden"} w-full grid-cols-1 gap-2.5 border-t border-border pt-3 sm:contents`}
      >
        <select
          aria-label="Filter by account"
          name="transactionAccount"
          autoComplete="off"
          className={selectClasses}
          value={filters.accountId ?? ""}
          onChange={(event) =>
            navigate({ accountId: event.target.value === "" ? undefined : event.target.value })
          }
        >
          <option value="">All accounts</option>
          {filters.accountId !== undefined &&
          !(accounts.data ?? []).some((account) => account.id === filters.accountId) ? (
            <option value={filters.accountId}>Archived or unavailable</option>
          ) : null}
          {(accounts.data ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by category"
          name="transactionCategory"
          autoComplete="off"
          className={selectClasses}
          value={filters.categoryId ?? ""}
          onChange={(event) =>
            navigate({ categoryId: event.target.value === "" ? undefined : event.target.value })
          }
        >
          <option value="">All categories</option>
          {filters.categoryId !== undefined &&
          !(categories.data ?? []).some((category) => category.id === filters.categoryId) ? (
            <option value={filters.categoryId}>Archived or unavailable</option>
          ) : null}
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 sm:flex sm:w-auto">
          <input
            type="date"
            name="transactionFrom"
            autoComplete="off"
            aria-label="From date"
            value={toDateInputValue(filters.from)}
            onChange={(event) => navigate({ from: parseDate(event.target.value) })}
            className="min-h-11 min-w-0 bg-transparent py-2.5 font-mono text-base text-foreground outline-none sm:text-xs"
          />
          <span className="text-xs text-foreground-muted" aria-hidden="true">
            →
          </span>
          <input
            type="date"
            name="transactionTo"
            autoComplete="off"
            aria-label="To date"
            value={toDateInputValue(filters.to)}
            onChange={(event) => navigate({ to: parseDate(event.target.value) })}
            className="min-h-11 min-w-0 bg-transparent py-2.5 font-mono text-base text-foreground outline-none sm:text-xs"
          />
        </div>
        {isFiltered ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear"
            title="Clear all filters (Esc)"
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface-muted/60 px-3 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:border-expense/40 hover:bg-expense/10 hover:text-expense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span>Clear</span>
            <span className="rounded-full bg-accent/20 px-1.5 py-0.5 font-mono text-[10px] text-accent">
              {activeFilterCount}
            </span>
          </button>
        ) : null}
      </div>

      {/* Active Filter Badges */}
      {isFiltered && (
        <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border/50 pt-2.5">
          <span className="font-mono text-[10px] font-semibold text-foreground-muted uppercase">
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
          {filters.categoryId !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
              <span>
                Category:{" "}
                {(categories.data ?? []).find((c) => c.id === filters.categoryId)?.name ??
                  "Selected"}
              </span>
              <button
                type="button"
                onClick={() => navigate({ categoryId: undefined })}
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
