import type { Account, CreditCardBill } from "@treasury-ops/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";

import { billProgress, dueLabel, formatBillDate } from "../model/bill-presentation";

function statusText(bill: CreditCardBill): string {
  if (bill.paymentStatus === "paid") return "Paid";
  if (bill.reconciliationStatus === "awaiting_statement") return "Statement required";
  return bill.paymentStatus === "partial" ? "Part-paid" : "Ready to pay";
}

export function BillCard({
  bill,
  account
}: Readonly<{ bill: CreditCardBill; account: Account | undefined }>): ReactNode {
  const progress = billProgress(bill);
  return (
    <article className="rounded-2xl border border-border bg-surface-elevated p-5 transition-colors hover:border-accent/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">
            {account?.name ?? "Credit card"}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            {formatBillDate(bill.cycleStart)} – {formatBillDate(bill.cycleEnd)}
          </p>
        </div>
        <span className="rounded-lg border border-border bg-surface-muted px-2 py-1 font-mono text-[10px] font-bold tracking-wide text-foreground-muted uppercase">
          {statusText(bill)}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <p className="font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
            Remaining
          </p>
          <div className="mt-1">
            <Money minor={bill.remainingMinor} size="lg" />
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
            Due date
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatBillDate(bill.dueDate)}
          </p>
          <p className="mt-0.5 text-xs text-foreground-muted">{dueLabel(bill)}</p>
        </div>
      </div>

      <div className="mt-5">
        <div
          role="progressbar"
          aria-label={`${progress}% of bill paid`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-foreground-muted">
          <span>
            Paid <Money minor={bill.paidMinor} size="sm" />
          </span>
          <span>
            Bill <Money minor={bill.amountDueMinor} size="sm" />
          </span>
        </div>
      </div>

      <Link
        href={`/bills/${bill.id}`}
        className="mt-5 flex items-center justify-between border-t border-border pt-4 text-sm font-semibold text-accent hover:text-accent-strong"
      >
        Open bill
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
