"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Transaction, TransactionPage } from "@vyaya/shared";
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
  const groups = [...legsByGroup.values()].filter((legs) => legs.length === 2);

  return (
    <section className="animate-fade-in">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[0.2em] text-accent uppercase">
            Ledger
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground">Transfers</h1>
          <p className="mt-2 max-w-md text-sm text-foreground-muted">
            Move money between your own accounts. Each transfer posts as two linked legs — an
            expense on one side, income on the other.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <span className="mr-1 text-base leading-none">+</span> New transfer
        </Button>
      </header>

      {groups.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          description="Transfers keep both sides of a money move in sync — no manual expense-plus-income pairs to reconcile."
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
