"use client";

import type { Account, Transaction } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";

type TransferGroupRowProps = Readonly<{
  legs: Transaction[];
  accounts: Account[];
  onOpen: (legs: Transaction[]) => void;
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

export function TransferGroupRow({ legs, accounts, onOpen }: TransferGroupRowProps): ReactNode {
  const first = legs[0];
  if (first === undefined) return null;
  const expense = legs.find((leg) => leg.type === "expense");
  const income = legs.find((leg) => leg.type === "income");
  const isReversed = legs.some((leg) => leg.status === "reversed");
  const isReversal = legs.some((leg) => leg.status === "reversal");
  const accountName = (id: string | undefined): string =>
    id === undefined
      ? "Account unavailable"
      : (accounts.find((account) => account.id === id)?.name ?? "Archived account");

  return (
    <button
      type="button"
      onClick={() => onOpen(legs)}
      className={`relative flex w-full flex-col items-stretch gap-3 overflow-hidden rounded-2xl border border-border bg-surface-elevated p-4 pl-5 text-left transition-colors duration-150 hover:border-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:flex-row sm:items-center sm:gap-4.5 sm:py-4.5 sm:pr-5 sm:pl-6 ${
        isReversed ? "opacity-60" : ""
      }`}
    >
      <span
        className={`absolute inset-y-3.5 left-0 w-[3px] rounded-sm ${isReversal ? "bg-amber-500" : "bg-accent"}`}
        aria-hidden="true"
      />
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-lg text-accent">
          ⤢
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex min-w-0 items-center gap-1.5 sm:gap-2.5">
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {accountName(expense?.accountId)}
            </span>
            <span className="shrink-0 font-mono text-sm text-accent" aria-hidden="true">
              →
            </span>
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {accountName(income?.accountId)}
            </span>
          </div>
          <p className="truncate text-[13px] text-foreground-muted">{first.description}</p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 pl-14 sm:ml-auto sm:block sm:shrink-0 sm:pl-0 sm:text-right">
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {isReversed ? (
            <span className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Reversed
            </span>
          ) : null}
          {isReversal ? (
            <span className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-2xs font-bold tracking-wider text-amber-500 uppercase">
              Reversal
            </span>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <Money minor={first.amountMinor} size="lg" className={isReversed ? "line-through" : ""} />
          <p className="mt-0.5 font-mono text-xs text-foreground-muted">
            {dateFormatter.format(first.occurredAt)}
          </p>
        </div>
      </div>
    </button>
  );
}
