"use client";

import type { ListTransactionsQuery } from "@vyaya/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";

import { serializeTransactionFilters } from "../model/filters";

type FilterDraft = Readonly<{
  query: string;
  from: string;
  to: string;
  accountId: string;
  categoryId: string;
}>;

function toDateInputValue(value: Date | undefined): string {
  return value === undefined ? "" : value.toISOString().slice(0, 10);
}

function toFilterDraft(filters: ListTransactionsQuery): FilterDraft {
  return {
    query: filters.q ?? "",
    from: toDateInputValue(filters.from),
    to: toDateInputValue(filters.to),
    accountId: filters.accountId ?? "",
    categoryId: filters.categoryId ?? ""
  };
}

function parseDate(value: string): Date | undefined {
  if (value === "") {
    return undefined;
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export function TxnFilters({ filters }: Readonly<{ filters: ListTransactionsQuery }>): ReactNode {
  const router = useRouter();
  const accounts = useAccounts();
  const categories = useCategories();
  const [draft, setDraft] = useState<FilterDraft>(() => toFilterDraft(filters));
  const isFiltered =
    draft.query !== "" ||
    draft.from !== "" ||
    draft.to !== "" ||
    draft.accountId !== "" ||
    draft.categoryId !== "";

  function navigate(next: FilterDraft): void {
    const query = serializeTransactionFilters({
      ...filters,
      q: next.query.trim() === "" ? undefined : next.query.trim(),
      from: parseDate(next.from),
      to: parseDate(next.to),
      accountId: next.accountId === "" ? undefined : next.accountId,
      categoryId: next.categoryId === "" ? undefined : next.categoryId,
      cursor: undefined
    });
    router.push(query === "" ? "/transactions" : `/transactions?${query}`);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    navigate(draft);
  }

  function clear(): void {
    const empty: FilterDraft = { query: "", from: "", to: "", accountId: "", categoryId: "" };
    setDraft(empty);
    navigate(empty);
  }

  return (
    <form
      className="mb-6 grid gap-4 rounded-xl border border-border bg-surface-elevated p-5 sm:grid-cols-2 lg:grid-cols-3 lg:items-end"
      onSubmit={submit}
    >
      <Input
        id="transaction-query"
        label="Search description"
        placeholder="Chai, rent, groceries…"
        value={draft.query}
        onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
      />
      <label className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
        Account
        <select
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm normal-case tracking-normal"
          value={draft.accountId}
          onChange={(event) =>
            setDraft((current) => ({ ...current, accountId: event.target.value }))
          }
        >
          <option value="">All accounts</option>
          {draft.accountId !== "" &&
          !(accounts.data ?? []).some((item) => item.id === draft.accountId) ? (
            <option value={draft.accountId}>Archived or unavailable</option>
          ) : null}
          {(accounts.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
        Category
        <select
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm normal-case tracking-normal"
          value={draft.categoryId}
          onChange={(event) =>
            setDraft((current) => ({ ...current, categoryId: event.target.value }))
          }
        >
          <option value="">All categories</option>
          {draft.categoryId !== "" &&
          !(categories.data ?? []).some((item) => item.id === draft.categoryId) ? (
            <option value={draft.categoryId}>Archived or unavailable</option>
          ) : null}
          {(categories.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.kind}
            </option>
          ))}
        </select>
      </label>
      <Input
        id="transaction-from"
        label="From"
        type="date"
        value={draft.from}
        onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
      />
      <Input
        id="transaction-to"
        label="To"
        type="date"
        value={draft.to}
        onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
      />
      <div className="flex gap-2 sm:mb-0.5">
        <Button type="submit" className="flex-1 sm:flex-none">
          Filter
        </Button>
        {isFiltered ? (
          <Button type="button" variant="secondary" onClick={clear}>
            Clear
          </Button>
        ) : null}
      </div>
    </form>
  );
}
