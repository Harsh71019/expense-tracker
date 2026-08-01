"use client";

import type { Category, Transaction, TransactionSource } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { IconGlyph } from "@/features/categories";

export const TXN_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[2.4fr_1fr_1fr_1.1fr] md:gap-4";

const SOURCE_LABEL: Record<TransactionSource, string> = {
  manual: "Manual",
  csv_import: "CSV",
  recurring: "Recurring",
  api: "API"
};

type TxnRowProps = Readonly<{
  transaction: Transaction;
  category: Category | undefined;
  onOpen: (transaction: Transaction) => void;
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata"
});

export function TxnRow({ transaction, category, onOpen }: TxnRowProps): ReactNode {
  const isReversed = transaction.status === "reversed";
  const isReversal = transaction.status === "reversal";
  const isIncome = transaction.type === "income";
  const icon = category?.icon ?? (isIncome ? "↓" : "↑");

  return (
    <button
      type="button"
      onClick={() => onOpen(transaction)}
      aria-label={`${transaction.description}, ${category?.name ?? "Uncategorized"}, ${dateFormatter.format(transaction.occurredAt)}`}
      className={`${TXN_ROW_GRID} w-full px-4 py-3.5 text-left transition-colors duration-150 hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-5 ${
        isReversed ? "opacity-55" : ""
      }`}
    >
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3 md:col-auto md:row-auto">
        <span className="grid h-9.5 w-9.5 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-border bg-surface-muted text-base">
          <IconGlyph value={icon} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`truncate text-sm font-semibold text-foreground ${isReversed ? "line-through" : ""}`}
            >
              {transaction.description}
            </span>
            {transaction.source === "manual" ? null : (
              <span className="shrink-0 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
                {SOURCE_LABEL[transaction.source]}
              </span>
            )}
          </div>
          {isReversed || isReversal ? (
            <p className="mt-0.5 text-xs font-medium text-amber-500">
              {isReversed ? "Reversed" : "Reversal entry"}
            </p>
          ) : null}
        </div>
      </div>
      <div
        className={`col-start-1 row-start-2 truncate pl-[50px] text-xs font-medium md:col-auto md:row-auto md:pl-0 md:text-sm ${category === undefined ? "text-foreground-muted/50" : "text-foreground-muted"}`}
      >
        {category?.name ?? "—"}
      </div>
      <div className="col-start-2 row-start-2 text-right font-mono text-[11px] font-medium text-foreground-muted md:col-auto md:row-auto md:text-left md:text-[13px]">
        {dateFormatter.format(transaction.occurredAt)}
      </div>
      <Money
        minor={transaction.amountMinor}
        variant={isReversed ? "neutral" : transaction.type}
        signed
        size="md"
        className={`col-start-2 row-start-1 justify-self-end md:col-auto md:row-auto ${isReversed ? "line-through" : ""}`}
      />
    </button>
  );
}
