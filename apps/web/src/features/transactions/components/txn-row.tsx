"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import type { Transaction } from "@vyaya/shared";
import type { ReactNode } from "react";
import Link from "next/link";

type TxnRowProps = Readonly<{
  transaction: Transaction;
  originalDescription: string | undefined;
  onReverse: (transactionId: string) => void;
  isReversing: boolean;
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata"
});

export function TxnRow({
  transaction,
  originalDescription,
  onReverse,
  isReversing
}: TxnRowProps): ReactNode {
  const isReversed = transaction.status === "reversed";
  const isReversal = transaction.status === "reversal";
  const isIncome = transaction.type === "income";

  const stripeColor = isReversed
    ? "bg-reversed"
    : isReversal
      ? "bg-accent"
      : isIncome
        ? "bg-income"
        : "bg-expense";

  return (
    <article
      className={`group relative flex items-center gap-4 px-4 py-3.5 transition-colors duration-150 hover:bg-surface-muted/50 ${
        isReversed ? "opacity-60" : ""
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${stripeColor}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 pl-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-foreground">
            <Link href={`/transactions/${transaction.id}`} className="hover:text-accent">
              {transaction.description}
            </Link>
          </h2>
          {isReversed ? <Badge variant="reversed">Reversed</Badge> : null}
        </div>
        <p className="mt-1 font-mono text-[10px] tracking-wider text-foreground-muted uppercase">
          {dateFormatter.format(transaction.occurredAt)}
          {isReversal ? ` · Reversal of: ${originalDescription ?? "original transaction"}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Money
          minor={transaction.amountMinor}
          variant={isReversed ? "neutral" : transaction.type}
          signed
          size="md"
          {...(isReversed ? { className: "line-through" } : {})}
        />
        {transaction.status === "posted" && transaction.transferGroupId === undefined ? (
          <Button
            type="button"
            variant="secondary"
            className="px-2.5 py-1 text-xs opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150"
            disabled={isReversing}
            onClick={() => onReverse(transaction.id)}
          >
            {isReversing ? "Undoing…" : "Undo"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
