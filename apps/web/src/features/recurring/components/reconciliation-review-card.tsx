"use client";

import type { RecurringReconciliationReviewItem, Transaction } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { toast } from "@/lib/toast";

import { useResolveRecurringReconciliation } from "../hooks/use-recurring-reconciliations";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type ReviewStatus = "ambiguous" | "amount_mismatch";

const STATUS_COPY: Record<ReviewStatus, Readonly<{ label: string; description: string }>> = {
  ambiguous: {
    label: "Possible duplicate",
    description:
      "This matches more than one recurring charge equally well. Pick which one it replaces, or say they're unrelated."
  },
  amount_mismatch: {
    label: "Amount doesn't match",
    description:
      "This looks like it might be the recurring charge below, but the amount is different."
  }
};

function isReviewStatus(status: string): status is ReviewStatus {
  return status === "ambiguous" || status === "amount_mismatch";
}

export function ReconciliationReviewCard({
  item,
  onResolved
}: Readonly<{
  item: RecurringReconciliationReviewItem;
  onResolved: (reconciliationId: string) => void;
}>): ReactNode {
  const resolve = useResolveRecurringReconciliation();
  const [chosenId, setChosenId] = useState<string>();
  const needsChoice = item.candidateTransactions.length > 1;
  const status = isReviewStatus(item.status)
    ? STATUS_COPY[item.status]
    : { label: "Needs review", description: "This recurring reconciliation needs a decision." };
  const headingId = `reconciliation-${item.id}-title`;

  function handleResolve(resolution: "confirmed_duplicate" | "confirmed_distinct"): void {
    resolve.mutate(
      {
        id: item.id,
        resolution,
        ...(resolution === "confirmed_duplicate" && chosenId !== undefined
          ? { chosenRecurringTransactionId: chosenId }
          : {})
      },
      {
        onSuccess: () => {
          toast.success(
            resolution === "confirmed_duplicate"
              ? "Marked as a duplicate — the recurring posting was reversed."
              : "Kept both — they're treated as separate charges."
          );
          onResolved(item.id);
        },
        onError: () => {
          toast.error("Could not resolve this reconciliation. Try again.");
        }
      }
    );
  }

  const confirmDisabled = resolve.isPending || (needsChoice && chosenId === undefined);

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-2xl border border-border bg-surface-elevated p-5"
    >
      <header>
        <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider text-accent uppercase">
          {status.label}
        </span>
        <h3 id={headingId} className="sr-only">
          Recurring reconciliation needs review
        </h3>
        <p className="mt-2 text-sm text-foreground-muted">{status.description}</p>
      </header>

      <div className="mt-4 space-y-2.5">
        <TransactionRow label="Incoming" transaction={item.incomingTransaction} emphasize />
        {item.candidateTransactions.map((candidate) => (
          <label
            key={candidate.id}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
              chosenId === candidate.id
                ? "border-accent bg-accent-glow"
                : "border-border bg-surface-muted"
            }`}
          >
            {needsChoice ? (
              <input
                type="radio"
                name={`reconciliation-${item.id}-candidate`}
                className="h-4 w-4 accent-accent"
                checked={chosenId === candidate.id}
                onChange={() => setChosenId(candidate.id)}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <TransactionRow label="Recurring" transaction={candidate} />
            </div>
          </label>
        ))}
      </div>

      <footer className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={resolve.isPending}
          onClick={() => handleResolve("confirmed_distinct")}
        >
          {resolve.isPending ? "Saving…" : "No, separate charges"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={confirmDisabled}
          onClick={() => handleResolve("confirmed_duplicate")}
        >
          {resolve.isPending ? "Saving…" : "Yes, same charge"}
        </Button>
      </footer>

      {resolve.isError ? (
        <p className="mt-3 rounded-lg border border-expense/25 bg-expense/10 px-3 py-2 font-mono text-[11px] text-expense">
          {resolve.error.message || "Could not resolve this reconciliation."}
        </p>
      ) : null}
    </article>
  );
}

function TransactionRow({
  label,
  transaction,
  emphasize = false
}: Readonly<{ label: string; transaction: Transaction; emphasize?: boolean }>): ReactNode {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[9px] font-bold tracking-wider text-foreground-muted uppercase">
          {label}
        </p>
        <p
          className={`truncate text-sm ${emphasize ? "font-semibold text-foreground" : "text-foreground-muted"}`}
        >
          {transaction.description}
        </p>
        <p className="font-mono text-[10px] text-foreground-muted">
          {dateFormatter.format(transaction.occurredAt)}
        </p>
      </div>
      <Money
        minor={transaction.amountMinor}
        variant={transaction.type}
        signed
        size={emphasize ? "md" : "sm"}
      />
    </div>
  );
}
