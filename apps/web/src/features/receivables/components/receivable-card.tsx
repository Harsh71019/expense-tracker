"use client";

import { formatMinor, type Receivable } from "@treasury-ops/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";

import {
  dueState,
  RECEIVABLE_STATUS_BADGE_VARIANT,
  RECEIVABLE_STATUS_LABEL
} from "../model/receivable-presentation";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

export function ReceivableCard({ receivable }: Readonly<{ receivable: Receivable }>): ReactNode {
  const due = dueState(receivable.dueAt, receivable.status);

  return (
    <Link
      href={`/debts-given/${receivable.id}`}
      className="glass-card glass-card-hover flex min-w-0 flex-col gap-3 rounded-2xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold tracking-tight text-foreground">
            {receivable.counterpartyName}
          </p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Lent {dateFormatter.format(receivable.openedAt)}
          </p>
        </div>
        <Badge variant={RECEIVABLE_STATUS_BADGE_VARIANT[receivable.status]}>
          {RECEIVABLE_STATUS_LABEL[receivable.status]}
        </Badge>
      </div>

      <div>
        <p className="font-mono text-2xs font-semibold tracking-wider text-foreground-muted uppercase">
          Outstanding
        </p>
        <Money minor={receivable.outstandingMinor} size="lg" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-2xs font-medium text-foreground-muted">
        <span>
          {receivable.repaymentCount} repayment{receivable.repaymentCount === 1 ? "" : "s"}
        </span>
        {receivable.confirmedRepaidMinor > 0 ? (
          <span>· {formatMinor(receivable.confirmedRepaidMinor)} returned</span>
        ) : null}
        {due === "overdue" ? (
          <span className="rounded-full border border-expense/30 bg-expense/10 px-2 py-0.5 font-bold text-expense uppercase tracking-wide">
            Overdue
          </span>
        ) : due === "upcoming" && receivable.dueAt !== undefined ? (
          <span>· Due {dateFormatter.format(receivable.dueAt)}</span>
        ) : null}
        {receivable.isMigrated ? (
          <span className="rounded-full border border-border/60 bg-surface-muted px-2 py-0.5 font-semibold uppercase tracking-wide">
            Imported from Assets
          </span>
        ) : null}
      </div>
    </Link>
  );
}
