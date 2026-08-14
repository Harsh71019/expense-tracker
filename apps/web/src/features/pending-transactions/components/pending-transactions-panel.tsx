"use client";

import type { PendingTransaction } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { usePendingTransactions } from "../hooks/use-pending-transactions";
import { PendingTransactionCard } from "./pending-transaction-card";

/**
 * n8n posts a draft here when a bank email confirms money moved but not how
 * much (e.g. a foreign-currency e-mandate charge) -- the ledger never gets a
 * guessed or missing amount, so this panel is where the real number gets
 * typed in. Renders nothing when there's nothing pending, so it's invisible
 * on the common path (mirrors ReconciliationReviewPanel).
 */
export function PendingTransactionsPanel({
  initialPendingTransactions
}: Readonly<{ initialPendingTransactions: PendingTransaction[] }>): ReactNode {
  const pendingTransactions = usePendingTransactions(initialPendingTransactions);
  const [resolvedIds, setResolvedIds] = useState<ReadonlySet<string>>(new Set());
  const items = (pendingTransactions.data ?? initialPendingTransactions).filter(
    (item) => !resolvedIds.has(item.id)
  );

  if (items.length === 0) return null;

  return (
    <section aria-label="Transactions needing an amount" className="space-y-3">
      <div>
        <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
          Needs your input
        </p>
        <h2 className="mt-1 text-lg font-bold text-foreground">
          {items.length} {items.length === 1 ? "transaction needs" : "transactions need"} an amount
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">
          A bank email confirmed money moved but not the exact amount — type it in to log it.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <PendingTransactionCard
            key={item.id}
            item={item}
            onResolved={(id) => setResolvedIds((current) => new Set(current).add(id))}
          />
        ))}
      </div>
    </section>
  );
}
