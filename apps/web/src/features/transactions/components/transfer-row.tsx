"use client";

import type { Account, Transaction } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";

import { TXN_ROW_GRID } from "./txn-row";
import { PaymentRailBadge } from "./payment-rail-badge";

type Props = Readonly<{
  legs: Transaction[];
  accounts: Account[];
  density?: "comfortable" | "compact" | undefined;
  onOpen: (transaction: Transaction) => void;
  onReverse: (groupId: string) => void;
  isReversing: boolean;
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

export function TransferRow({
  legs,
  accounts,
  density = "comfortable",
  onOpen,
  onReverse,
  isReversing
}: Props): ReactNode {
  const first = legs[0];
  if (first === undefined || first.transferGroupId === undefined) return null;
  const expense = legs.find((leg) => leg.type === "expense");
  const income = legs.find((leg) => leg.type === "income");
  const accountName = (id: string | undefined): string =>
    id === undefined
      ? "Account unavailable"
      : (accounts.find((account) => account.id === id)?.name ?? "Archived account");
  const posted = legs.some((leg) => leg.status === "posted");
  const paymentRail = legs.every((leg) => leg.paymentRail === first.paymentRail)
    ? first.paymentRail
    : "unknown";
  const isCompact = density === "compact";

  return (
    <div
      className={`${TXN_ROW_GRID} group relative w-full text-left transition-colors duration-150 hover:bg-surface-muted/50 ${
        isCompact ? "px-3.5 py-2 sm:px-4" : "px-4 py-3.5 sm:px-5"
      } ${posted ? "" : "opacity-55"}`}
    >
      <button
        type="button"
        aria-label={`Open transfer: ${first.description}`}
        onClick={() => onOpen(first)}
        className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      />
      <div className="pointer-events-none relative z-10 col-start-1 row-start-1 flex min-w-0 items-center gap-3 md:col-auto md:row-auto">
        <span
          className={`grid shrink-0 place-items-center rounded-xl border border-border bg-surface-muted ${
            isCompact ? "h-8 w-8 text-xs" : "h-9.5 w-9.5 text-base"
          }`}
        >
          ⤢
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span
              className={`truncate font-semibold text-foreground ${
                isCompact ? "text-[13px]" : "text-sm"
              }`}
            >
              {first.description}
            </span>
            <span className="shrink-0 rounded-md bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-accent uppercase">
              ⤢ Transfer
            </span>
            <PaymentRailBadge rail={paymentRail} />
          </div>
          <p className="mt-0.5 truncate text-xs text-foreground-muted">
            {accountName(expense?.accountId)} → {accountName(income?.accountId)}
          </p>
        </div>
      </div>
      <div className="pointer-events-none relative z-10 hidden text-sm font-medium text-foreground-muted/50 md:block">
        Transfer
      </div>
      <div className="pointer-events-none relative z-10 hidden text-xs font-medium text-foreground-muted md:block">
        Multiple legs
      </div>
      <div className="pointer-events-none relative z-10 col-start-2 row-start-2 text-right font-mono text-[11px] font-medium text-foreground-muted md:col-auto md:row-auto md:text-left md:text-[12.5px]">
        {dateFormatter.format(first.occurredAt)}
      </div>
      <div className="pointer-events-none relative z-10 col-start-2 row-start-1 flex items-center justify-end gap-1.5 md:col-auto md:row-auto md:gap-2.5">
        {posted ? (
          <button
            type="button"
            onClick={() => onReverse(first.transferGroupId ?? "")}
            disabled={isReversing}
            aria-label={isReversing ? "Reversing transfer" : "Reverse transfer"}
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface-elevated px-2 text-xs font-semibold text-foreground-muted opacity-100 transition-opacity duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:h-auto md:w-auto md:py-1 md:text-xs md:opacity-0 md:group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-50"
          >
            <span aria-hidden="true" className="md:hidden">
              ↺
            </span>
            <span className="hidden md:inline">{isReversing ? "Reversing…" : "Reverse"}</span>
          </button>
        ) : null}
        <Money
          minor={first.amountMinor}
          size={isCompact ? "sm" : "md"}
          className="justify-self-end"
        />
      </div>
    </div>
  );
}
