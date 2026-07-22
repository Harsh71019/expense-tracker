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
      className={`relative flex w-full items-center gap-4.5 overflow-hidden rounded-2xl border border-border bg-surface-elevated py-4.5 pr-5 pl-6 text-left transition-colors duration-150 hover:border-accent/30 ${
        isReversed ? "opacity-60" : ""
      }`}
    >
      <span
        className={`absolute inset-y-3.5 left-0 w-[3px] rounded-sm ${isReversal ? "bg-amber-500" : "bg-accent"}`}
        aria-hidden="true"
      />
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-lg text-accent">
        ⤢
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
          <span className="truncate text-sm font-semibold whitespace-nowrap text-foreground">
            {accountName(expense?.accountId)}
          </span>
          <span className="font-mono text-sm text-accent" aria-hidden="true">
            →
          </span>
          <span className="truncate text-sm font-semibold whitespace-nowrap text-foreground">
            {accountName(income?.accountId)}
          </span>
          {isReversed ? (
            <span className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
              Reversed
            </span>
          ) : null}
          {isReversal ? (
            <span className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-amber-500 uppercase">
              Reversal
            </span>
          ) : null}
        </div>
        <p className="truncate text-[13px] text-foreground-muted">{first.description}</p>
      </div>
      <div className="shrink-0 text-right">
        <Money minor={first.amountMinor} size="lg" className={isReversed ? "line-through" : ""} />
        <p className="mt-0.5 font-mono text-xs text-foreground-muted">
          {dateFormatter.format(first.occurredAt)}
        </p>
      </div>
    </button>
  );
}
