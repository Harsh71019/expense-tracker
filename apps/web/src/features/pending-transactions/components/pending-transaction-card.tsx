"use client";

import type { PendingTransaction } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

import {
  useConfirmPendingTransaction,
  useDismissPendingTransaction
} from "../hooks/use-pending-transactions";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

export function PendingTransactionCard({
  item,
  onResolved
}: Readonly<{
  item: PendingTransaction;
  onResolved: (pendingTransactionId: string) => void;
}>): ReactNode {
  const confirm = useConfirmPendingTransaction();
  const dismiss = useDismissPendingTransaction();
  const [amountMinor, setAmountMinor] = useState(0);
  const headingId = `pending-transaction-${item.id}-title`;
  const isPending = confirm.isPending || dismiss.isPending;

  function handleConfirm(): void {
    confirm.mutate(
      { id: item.id, amountMinor },
      {
        onSuccess: () => {
          toast.success("Logged to your ledger.");
          onResolved(item.id);
        },
        onError: () => {
          toast.error("Could not log this transaction. Try again.");
        }
      }
    );
  }

  function handleDismiss(): void {
    dismiss.mutate(item.id, {
      onSuccess: () => {
        toast.success("Dismissed.");
        onResolved(item.id);
      },
      onError: () => {
        toast.error("Could not dismiss this transaction. Try again.");
      }
    });
  }

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-2xl border border-border bg-surface-elevated p-5"
    >
      <header>
        <h3 id={headingId} className="truncate text-sm font-semibold text-foreground">
          {item.description}
        </h3>
        <p className="mt-1 font-mono text-[10px] text-foreground-muted">
          {dateFormatter.format(item.occurredAt)} &middot; {item.type}
        </p>
      </header>

      <div className="mt-4">
        <AmountInput
          id={`pending-transaction-${item.id}-amount`}
          label="Amount"
          value={amountMinor}
          onChange={setAmountMinor}
        />
      </div>

      <footer className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={handleDismiss}
        >
          {dismiss.isPending ? "Dismissing…" : "Dismiss"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isPending || amountMinor <= 0}
          onClick={handleConfirm}
        >
          {confirm.isPending ? "Saving…" : "Confirm"}
        </Button>
      </footer>

      {confirm.isError || dismiss.isError ? (
        <p className="mt-3 rounded-lg border border-expense/25 bg-expense/10 px-3 py-2 font-mono text-[11px] text-expense">
          {(confirm.error ?? dismiss.error)?.message || "Something went wrong."}
        </p>
      ) : null}
    </article>
  );
}
