"use client";

import type { Account, BillPage, ListBillsQuery } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";

import { useBills } from "../hooks/use-bills";
import { dueLabel } from "../model/bill-presentation";
import { BillCard } from "./bill-card";
import { BillFilters } from "./bill-filters";

export function BillList({
  initialPage,
  filters,
  accounts
}: Readonly<{
  initialPage: BillPage;
  filters: ListBillsQuery;
  accounts: Account[];
}>): ReactNode {
  const query = useBills(filters, initialPage);
  const bills = query.data?.pages.flatMap((page) => page.items) ?? initialPage.items;
  const cards = accounts.filter((account) => account.type === "credit_card" && !account.isArchived);
  const outstanding = bills.reduce((sum, bill) => sum + bill.remainingMinor, 0);
  const actionCount = bills.filter(
    (bill) => bill.reconciliationStatus === "awaiting_statement"
  ).length;
  const nextDue = [...bills]
    .filter((bill) => bill.paymentStatus !== "paid")
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())[0];

  return (
    <section className="space-y-7">
      <header className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
            Card control centre
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Credit card bills
          </h1>
          <p className="mt-2 max-w-xl text-sm text-foreground-muted">
            Verify each issuer statement against your ledger before money moves.
          </p>
        </div>
        <BillFilters filters={filters} cards={cards} />
      </header>

      {bills.length === 0 ? null : (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface-elevated p-5">
            <p className="font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
              Outstanding · shown bills
            </p>
            <div className="mt-2">
              <Money minor={outstanding} size="lg" />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface-elevated p-5">
            <p className="font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
              Next due
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {nextDue === undefined ? "Nothing due" : dueLabel(nextDue)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-elevated p-5">
            <p className="font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
              Needs review · shown bills
            </p>
            <p className="mt-2 text-2xl font-bold text-foreground">{actionCount}</p>
          </div>
        </div>
      )}

      {query.isError ? (
        <div role="alert" className="rounded-xl border border-expense/30 bg-expense/10 p-4">
          <p className="font-semibold text-expense">Could not refresh bills</p>
          <p className="mt-1 text-sm text-foreground-muted">{query.error.message}</p>
        </div>
      ) : null}

      {cards.length === 0 ? (
        <EmptyState
          title="No credit cards configured"
          description="Create a credit-card account and set its statement and due days to start generating bills."
        />
      ) : bills.length === 0 ? (
        <EmptyState
          title="No generated bills yet"
          description="Your first bill appears after the configured statement date. Existing card activity stays in the ledger."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {bills.map((bill) => (
              <BillCard
                key={bill.id}
                bill={bill}
                account={accounts.find((account) => account.id === bill.accountId)}
              />
            ))}
          </div>
          {query.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                className="w-full sm:w-auto"
                type="button"
                variant="secondary"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
