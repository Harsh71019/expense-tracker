"use client";

import type {
  Account,
  Category,
  ListTransactionsQuery,
  Transaction,
  TransactionPage
} from "@treasury-ops/shared";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAccounts } from "@/features/accounts/hooks/use-accounts";
import { useCategories } from "@/features/categories";
import { TXN_ROW_GRID, TxnDetailDrawer, TxnRow, useTxnList } from "@/features/transactions";

type AccountTransactionLedgerProps = Readonly<{
  account: Account;
  initialPage: TransactionPage;
  initialAccounts: Account[];
  initialCategories: Category[];
}>;

export function AccountTransactionLedger({
  account,
  initialPage,
  initialAccounts,
  initialCategories
}: AccountTransactionLedgerProps): ReactNode {
  const router = useRouter();
  const filters: ListTransactionsQuery = useMemo(
    () => ({ accountId: account.id, limit: initialPage.pageInfo.limit }),
    [account.id, initialPage.pageInfo.limit]
  );
  const list = useTxnList(filters, initialPage);
  useAccounts(initialAccounts);
  const categories = useCategories(initialCategories);
  const [selected, setSelected] = useState<Transaction>();
  const transactions = useMemo(
    () => (list.data?.pages ?? [initialPage]).flatMap((page) => page.items),
    [initialPage, list.data?.pages]
  );
  const categoryById = useMemo(
    () =>
      new Map((categories.data ?? initialCategories).map((category) => [category.id, category])),
    [categories.data, initialCategories]
  );

  return (
    <section aria-labelledby="account-ledger-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Account ledger
          </p>
          <h2 id="account-ledger-title" className="mt-1 text-xl font-bold text-foreground">
            Transactions
          </h2>
          <p className="mt-1 text-xs text-foreground-muted">
            Only entries posted to {account.name} appear here.
          </p>
        </div>
        <p className="font-mono text-xs font-semibold text-foreground-muted" aria-live="polite">
          {transactions.length} loaded
        </p>
      </div>

      {list.isError ? (
        <div role="alert" className="rounded-xl border border-expense/30 bg-expense/10 p-4">
          <p className="text-sm font-semibold text-expense">Could not load more transactions.</p>
          <p className="mt-1 text-xs text-foreground-muted">
            The entries already loaded remain visible.
          </p>
        </div>
      ) : null}

      {transactions.length === 0 ? (
        <EmptyState
          title="No transactions in this account"
          description="Post the first income or expense to start this account statement."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/90 bg-surface-elevated shadow-xs">
          <div
            className={`${TXN_ROW_GRID} hidden border-b border-border/80 bg-surface-muted/60 px-5 py-3 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase md:grid`}
          >
            <div>Description</div>
            <div>Category</div>
            <div>Date</div>
            <div className="text-right">Amount</div>
          </div>
          <div className="divide-y divide-border/70">
            {transactions.map((transaction) => (
              <TxnRow
                key={transaction.id}
                transaction={transaction}
                category={
                  transaction.categoryId === undefined
                    ? undefined
                    : categoryById.get(transaction.categoryId)
                }
                density="comfortable"
                onOpen={setSelected}
              />
            ))}
          </div>
        </div>
      )}

      {list.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            isLoading={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? "Loading entries…" : "Load older entries"}
          </Button>
        </div>
      ) : transactions.length === 0 ? null : (
        <p className="text-center font-mono text-2xs text-foreground-muted">
          End of this account&apos;s ledger
        </p>
      )}

      {selected === undefined ? null : (
        <TxnDetailDrawer
          transaction={selected}
          onClose={() => {
            setSelected(undefined);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
