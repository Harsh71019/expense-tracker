"use client";

import type { Account, Transaction } from "@vyaya/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";

type Props = Readonly<{
  legs: Transaction[];
  accounts: Account[];
  onReverse: (groupId: string) => void;
  isReversing: boolean;
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata"
});

export function TransferRow({ legs, accounts, onReverse, isReversing }: Props): ReactNode {
  const first = legs[0];
  if (first === undefined || first.transferGroupId === undefined) return null;
  const expense = legs.find((leg) => leg.type === "expense");
  const income = legs.find((leg) => leg.type === "income");
  const accountName = (id: string | undefined): string =>
    id === undefined
      ? "Account unavailable"
      : (accounts.find((account) => account.id === id)?.name ?? "Archived account");
  const posted = legs.some((leg) => leg.status === "posted");
  return (
    <article className="rounded-xl border border-accent/30 border-l-4 border-l-accent bg-surface-elevated p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">
              <Link href={`/transactions/${first.id}`} className="hover:text-accent">
                {first.description}
              </Link>
            </h2>
            <Badge variant={posted ? "success" : "reversed"}>Transfer</Badge>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            From {accountName(expense?.accountId)} → To {accountName(income?.accountId)}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-foreground-muted">
            {dateFormatter.format(first.occurredAt)} ·{" "}
            {legs.length === 2 ? "Both legs loaded" : "Transfer details loading"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <Money minor={first.amountMinor} />
          {posted ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isReversing}
              onClick={() => onReverse(first.transferGroupId ?? "")}
            >
              {isReversing ? "Reversing…" : "Reverse transfer"}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
