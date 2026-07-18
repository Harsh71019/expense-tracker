"use client";

import type { ListTransactionsQuery } from "@vyaya/shared";
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
  "rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm font-medium text-foreground outline-none transition-colors duration-150 focus:border-accent focus:ring-2 focus:ring-accent/30";

export function TxnFilters({ filters }: Readonly<{ filters: ListTransactionsQuery }>): ReactNode {
  const router = useRouter();
  const accounts = useAccounts();
  const categories = useCategories();
  const [query, setQuery] = useState(filters.q ?? "");

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
      navigate({ q: trimmed === "" ? undefined : trimmed });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  const isFiltered =
    filters.q !== undefined ||
    filters.accountId !== undefined ||
    filters.categoryId !== undefined ||
    filters.from !== undefined ||
    filters.to !== undefined;

  function clear(): void {
    setQuery("");
    router.push("/transactions");
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-surface-elevated p-3">
      <div className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-muted px-3">
        <span className="text-foreground-muted" aria-hidden="true">
          ⌕
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search description…"
          aria-label="Search description"
          className="w-full bg-transparent py-2.5 text-sm text-foreground outline-none placeholder:text-foreground-muted/60"
        />
      </div>
      <select
        aria-label="Filter by account"
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
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5">
        <input
          type="date"
          aria-label="From date"
          value={toDateInputValue(filters.from)}
          onChange={(event) => navigate({ from: parseDate(event.target.value) })}
          className="bg-transparent py-2.5 font-mono text-xs text-foreground outline-none"
        />
        <span className="text-xs text-foreground-muted" aria-hidden="true">
          →
        </span>
        <input
          type="date"
          aria-label="To date"
          value={toDateInputValue(filters.to)}
          onChange={(event) => navigate({ to: parseDate(event.target.value) })}
          className="bg-transparent py-2.5 font-mono text-xs text-foreground outline-none"
        />
      </div>
      {isFiltered ? (
        <button
          type="button"
          onClick={clear}
          className="rounded-lg px-2.5 py-2 text-sm font-medium text-foreground-muted hover:text-foreground"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
