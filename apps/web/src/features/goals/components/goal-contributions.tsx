"use client";

import type { ListTransactionsQuery, TransactionPage } from "@treasury-ops/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { useTxnList } from "@/features/transactions";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type GoalContributionsProps = Readonly<{
  filters: ListTransactionsQuery;
  initialPage: TransactionPage;
}>;

export function GoalContributions({ filters, initialPage }: GoalContributionsProps): ReactNode {
  const list = useTxnList(filters, initialPage);
  const transactions = (list.data?.pages ?? [initialPage]).flatMap((page) => page.items);

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-5 sm:p-6">
      <div>
        <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
          Ledger evidence
        </p>
        <h2 className="mt-1 text-lg font-bold text-foreground">Contributions</h2>
      </div>
      {transactions.length === 0 ? (
        <p className="mt-5 rounded-xl bg-surface-muted p-4 text-sm text-foreground-muted">
          No matching ledger entries yet.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border">
          {transactions.map((transaction) => (
            <Link
              key={transaction.id}
              href={`/transactions/${transaction.id}`}
              className="flex items-center justify-between gap-4 py-3 hover:text-accent"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {transaction.description}
                </span>
                <span className="mt-0.5 block font-mono text-2xs text-foreground-muted">
                  {dateFormatter.format(transaction.occurredAt)}
                </span>
              </span>
              <Money
                minor={transaction.amountMinor}
                variant={transaction.type}
                signed
                size="sm"
                className="shrink-0"
              />
            </Link>
          ))}
        </div>
      )}
      {list.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
