"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import type { Transaction, TransactionPage } from "@treasury-ops/shared";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useAccounts } from "@/features/accounts";
import { useTxnList } from "@/features/transactions/hooks/use-txn-list";

import { CreateTransferSheet } from "./create-transfer-sheet";
import { TransferDetailDrawer } from "./transfer-detail-drawer";
import { TransferGroupRow } from "./transfer-group-row";

const TRANSFER_PAGE_LIMIT = 100;

export function TransferList({
  initialPage
}: Readonly<{ initialPage: TransactionPage }>): ReactNode {
  const list = useTxnList({ limit: TRANSFER_PAGE_LIMIT }, initialPage);
  const accounts = useAccounts();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Transaction[]>();
  const [searchQuery, setSearchQuery] = useState("");
  const [accountId, setAccountId] = useState("");
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = list;

  // The mock/design shows every transfer with no pagination UI — transfers are comparatively
  // rare, so unlike the main transaction ledger it's reasonable to just fetch every page rather
  // than require manual "Load more" clicks. This also avoids splitting a group's two legs (which
  // always share the same occurredAt) across a page boundary and having one leg go unrendered.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const transactions = (list.data?.pages ?? [initialPage]).flatMap((page) => page.items);
  const legsByGroup = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (transaction.transferGroupId === undefined) continue;
    const current = legsByGroup.get(transaction.transferGroupId) ?? [];
    legsByGroup.set(transaction.transferGroupId, [...current, transaction]);
  }
  let groups = [...legsByGroup.values()].filter((legs) => legs.length === 2);

  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase().trim();
    groups = groups.filter((legs) => legs.some((leg) => leg.description.toLowerCase().includes(q)));
  }

  if (accountId !== "") {
    groups = groups.filter((legs) => legs.some((leg) => leg.accountId === accountId));
  }

  const isFiltered = searchQuery.trim() !== "" || accountId !== "";

  const accountOptions = [
    { value: "", label: "All accounts" },
    ...(accounts.data ?? []).map((acc) => ({ value: acc.id, label: acc.name }))
  ];

  return (
    <section className="animate-fade-in">
      <header className="mb-7 flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Ledger
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Transfers
          </h1>
          <p className="mt-2 max-w-md text-sm text-foreground-muted">
            Move money between your own accounts. Each transfer posts as two linked legs — an
            expense on one side, income on the other.
          </p>
        </div>
        <Button className="w-full sm:w-auto" type="button" onClick={() => setCreateOpen(true)}>
          <span className="mr-1 text-base leading-none">+</span> New transfer
        </Button>
      </header>

      <div
        className={`mb-5 flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
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
            value={searchQuery}
            name="transferSearch"
            autoComplete="off"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search transfer notes or description…"
            aria-label="Search transfers"
            className="min-h-10 w-full bg-transparent py-2 text-base text-foreground outline-none placeholder:text-foreground-muted/60 sm:text-sm"
          />
          {searchQuery !== "" && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search input"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-foreground-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ✕
            </button>
          )}
        </div>

        <div className="w-full sm:w-52">
          <Select
            aria-label="Filter by account"
            name="transferAccount"
            options={accountOptions}
            value={accountId}
            onChange={(val) => setAccountId(val)}
          />
        </div>

        {isFiltered ? (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setAccountId("");
            }}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-surface-muted/60 px-3.5 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:border-expense/40 hover:bg-expense/10 hover:text-expense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span>Clear</span>
          </button>
        ) : null}

        {isFiltered && (
          <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
            <span className="font-mono text-2xs font-semibold text-foreground-muted uppercase">
              Active:
            </span>
            {searchQuery !== "" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
                <span>Search: &quot;{searchQuery}&quot;</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="hover:text-foreground focus-visible:outline-none"
                  aria-label="Remove search filter"
                >
                  ×
                </button>
              </span>
            )}
            {accountId !== "" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-glow px-2.5 py-0.5 font-mono text-xs font-medium text-accent">
                <span>
                  Account:{" "}
                  {(accounts.data ?? []).find((a) => a.id === accountId)?.name ?? "Selected"}
                </span>
                <button
                  type="button"
                  onClick={() => setAccountId("")}
                  className="hover:text-foreground focus-visible:outline-none"
                  aria-label="Remove account filter"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title={isFiltered ? "No transfers found" : "No transfers yet"}
          description={
            isFiltered
              ? "No transfers match your active search or filter parameters."
              : "Transfers keep both sides of a money move in sync — no manual expense-plus-income pairs to reconcile."
          }
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <span className="mr-1 text-base leading-none">+</span> New transfer
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((legs) => {
            const groupId = legs[0]?.transferGroupId;
            return (
              <TransferGroupRow
                key={groupId}
                legs={legs}
                accounts={accounts.data ?? []}
                onOpen={setSelected}
              />
            );
          })}
        </div>
      )}

      {list.hasNextPage || list.isFetchingNextPage ? (
        <p className="mt-5 text-center font-mono text-xs text-foreground-muted">
          Loading more transfers…
        </p>
      ) : null}
      {list.isError ? (
        <p className="mt-4 text-center text-sm text-expense">Could not refresh transfers.</p>
      ) : null}

      {createOpen ? <CreateTransferSheet onClose={() => setCreateOpen(false)} /> : null}
      {selected === undefined ? null : (
        <TransferDetailDrawer
          key={selected[0]?.transferGroupId}
          legs={selected}
          accounts={accounts.data ?? []}
          onClose={() => setSelected(undefined)}
        />
      )}
    </section>
  );
}
