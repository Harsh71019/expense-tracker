"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  type ListTransactionsQuery,
  type Transaction,
  type TransactionPage
} from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { useTxnList } from "../hooks/use-txn-list";
import { CreateTxnSheet } from "./create-txn-sheet";
import { TxnDetailDrawer } from "./txn-detail-drawer";
import { TxnFilters } from "./txn-filters";
import { TXN_ROW_GRID, TxnRow } from "./txn-row";
import { TransferRow } from "./transfer-row";
import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";
import { useReverseTransfer } from "@/features/transfers/hooks/use-transfers";

export function TxnList({
  filters,
  initialPage
}: Readonly<{ filters: ListTransactionsQuery; initialPage: TransactionPage }>): ReactNode {
  const list = useTxnList(filters, initialPage);
  const reverseTransfer = useReverseTransfer();
  const accounts = useAccounts();
  const categories = useCategories();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Transaction>();

  const transactions = (list.data?.pages ?? [initialPage]).flatMap((page) => page.items);
  const categoryById = new Map((categories.data ?? []).map((category) => [category.id, category]));
  const transferLegs = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (transaction.transferGroupId !== undefined) {
      const current = transferLegs.get(transaction.transferGroupId) ?? [];
      transferLegs.set(transaction.transferGroupId, [...current, transaction]);
    }
  }
  const renderedTransfers = new Set<string>();

  return (
    <section className="animate-fade-in">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[0.2em] text-accent uppercase">
            Ledger
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground">Transactions</h1>
          <p className="mt-2 max-w-md text-sm text-foreground-muted">
            Every entry, append-only. Corrections happen by reversal, never by editing amounts.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <span className="mr-1 text-base leading-none">+</span> New entry
        </Button>
      </header>

      <TxnFilters filters={filters} />

      <p className="mb-3 font-mono text-xs font-medium text-foreground-muted">
        {transactions.length} {transactions.length === 1 ? "transaction" : "transactions"} · sorted
        by date
      </p>

      {transactions.length === 0 ? (
        <EmptyState
          title="No transactions match"
          description="Try widening the date range or clearing filters."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated">
          <div
            className={`${TXN_ROW_GRID} border-b border-border px-5 py-3.5 font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase`}
          >
            <div>Description</div>
            <div>Category</div>
            <div>Date</div>
            <div className="text-right">Amount</div>
          </div>
          <div className="divide-y divide-border">
            {transactions.map((transaction) => {
              if (transaction.transferGroupId !== undefined) {
                if (renderedTransfers.has(transaction.transferGroupId)) return null;
                renderedTransfers.add(transaction.transferGroupId);
                return (
                  <TransferRow
                    key={transaction.transferGroupId}
                    legs={transferLegs.get(transaction.transferGroupId) ?? [transaction]}
                    accounts={accounts.data ?? []}
                    onOpen={setSelected}
                    onReverse={(groupId) => reverseTransfer.mutate(groupId)}
                    isReversing={reverseTransfer.isPending}
                  />
                );
              }
              return (
                <TxnRow
                  key={transaction.id}
                  transaction={transaction}
                  category={
                    transaction.categoryId === undefined
                      ? undefined
                      : categoryById.get(transaction.categoryId)
                  }
                  onOpen={setSelected}
                />
              );
            })}
          </div>
        </div>
      )}

      {list.hasNextPage ? (
        <div className="mt-5 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? "Loading entries…" : "Load more"}
          </Button>
        </div>
      ) : null}
      {list.isError ? (
        <p className="mt-4 text-center text-sm text-expense">Could not refresh the ledger.</p>
      ) : null}

      {createOpen ? <CreateTxnSheet onClose={() => setCreateOpen(false)} /> : null}
      {selected === undefined ? null : (
        <TxnDetailDrawer
          key={selected.id}
          transaction={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </section>
  );
}
