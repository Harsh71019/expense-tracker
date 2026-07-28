import type { BillDetail } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";

import { billProgress, dueLabel, formatBillDate } from "../model/bill-presentation";

export function BillSummary({ detail }: Readonly<{ detail: BillDetail }>): ReactNode {
  const progress = billProgress(detail.bill);
  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
            {detail.account.name}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Statement bill
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Cycle {formatBillDate(detail.bill.cycleStart)} – {formatBillDate(detail.bill.cycleEnd)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
            Remaining
          </p>
          <div className="mt-1">
            <Money minor={detail.bill.remainingMinor} size="hero" />
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {dueLabel(detail.bill)} · {formatBillDate(detail.bill.dueDate)}
          </p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-foreground-muted">Immutable cycle amount</p>
          <div className="mt-1">
            <Money minor={detail.bill.amountDueMinor} />
          </div>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Paid</p>
          <div className="mt-1">
            <Money minor={detail.bill.paidMinor} variant="income" />
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-xs text-foreground-muted">Payment progress</p>
          <div
            role="progressbar"
            aria-label={`${progress}% of bill paid`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
