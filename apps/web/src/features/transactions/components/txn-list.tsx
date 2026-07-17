"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { type ListTransactionsQuery, type TransactionPage } from "@vyaya/shared";
import type { ReactNode } from "react";

import { useReverseTxn } from "../hooks/use-reverse-txn";
import { useTxnList } from "../hooks/use-txn-list";
import { TxnFilters } from "./txn-filters";
import { TxnRow } from "./txn-row";
import { TransferRow } from "./transfer-row";
import { useAccounts } from "@/features/accounts";
import { useReverseTransfer } from "@/features/transfers";

export function TxnList({
  filters,
  initialPage
}: Readonly<{ filters: ListTransactionsQuery; initialPage: TransactionPage }>): ReactNode {
  const list = useTxnList(filters, initialPage);
  const reverse = useReverseTxn();
  const reverseTransfer = useReverseTransfer();
  const accounts = useAccounts();
  const transactions = (list.data?.pages ?? [initialPage]).flatMap((page) => page.items);
  const descriptions = new Map(
    transactions.map((transaction) => [transaction.id, transaction.description])
  );
  const transferLegs = new Map<string, typeof transactions>();
  for (const transaction of transactions) {
    if (transaction.transferGroupId !== undefined) {
      const current = transferLegs.get(transaction.transferGroupId) ?? [];
      transferLegs.set(transaction.transferGroupId, [...current, transaction]);
    }
  }
  const renderedTransfers = new Set<string>();

  return (
    <section className="animate-fade-in">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Transactions</h1>
        <p className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
          {transactions.length} entries shown
        </p>
      </div>
      <TxnFilters filters={filters} />
      {transactions.length === 0 ? (
        <EmptyState
          title="Your ledger is clear"
          description="Every entry you add will appear here — with its full audit trail."
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {transactions.map((transaction) => {
            if (transaction.transferGroupId !== undefined) {
              if (renderedTransfers.has(transaction.transferGroupId)) return null;
              renderedTransfers.add(transaction.transferGroupId);
              return (
                <TransferRow
                  key={transaction.transferGroupId}
                  legs={transferLegs.get(transaction.transferGroupId) ?? [transaction]}
                  accounts={accounts.data ?? []}
                  onReverse={(groupId) => reverseTransfer.mutate(groupId)}
                  isReversing={reverseTransfer.isPending}
                />
              );
            }
            return (
              <TxnRow
                key={transaction.id}
                transaction={transaction}
                originalDescription={
                  transaction.reversalOf === undefined
                    ? undefined
                    : descriptions.get(transaction.reversalOf)
                }
                onReverse={(transactionId) => reverse.mutate(transactionId)}
                isReversing={reverse.isPending}
              />
            );
          })}
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
    </section>
  );
}
