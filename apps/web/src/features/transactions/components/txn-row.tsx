"use client";

import type { Category, Transaction, TransactionSource } from "@vyaya/shared";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";

export const TXN_ROW_GRID = "grid grid-cols-[2.4fr_1fr_1fr_1.1fr] items-center gap-4";

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
      className={`${TXN_ROW_GRID} w-full px-5 py-3.5 text-left transition-colors duration-150 hover:bg-surface-muted/50 ${
        isReversed ? "opacity-55" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9.5 w-9.5 shrink-0 place-items-center rounded-[10px] border border-border bg-surface-muted text-base">
          {icon}
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
        className={`truncate text-sm font-medium ${category === undefined ? "text-foreground-muted/50" : "text-foreground-muted"}`}
      >
        {category?.name ?? "—"}
      </div>
      <div className="font-mono text-[13px] font-medium text-foreground-muted">
        {dateFormatter.format(transaction.occurredAt)}
      </div>
      <Money
        minor={transaction.amountMinor}
        variant={isReversed ? "neutral" : transaction.type}
        signed
        size="md"
        className={`justify-self-end ${isReversed ? "line-through" : ""}`}
      />
    </button>
  );
}
