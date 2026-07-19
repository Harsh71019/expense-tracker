"use client";

import type { Account, Transaction } from "@vyaya/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { ReverseConfirmDialog } from "@/features/transactions/components/reverse-confirm-dialog";

import { useReverseTransfer } from "../hooks/use-transfers";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata"
});

type TransferDetailDrawerProps = Readonly<{
  legs: Transaction[];
  accounts: Account[];
  onClose: () => void;
}>;

export function TransferDetailDrawer({
  legs,
  accounts,
  onClose
}: TransferDetailDrawerProps): ReactNode {
  const reverse = useReverseTransfer();
  const [reverseOpen, setReverseOpen] = useState(false);

  const first = legs[0];
  const expense = legs.find((leg) => leg.type === "expense");
  const income = legs.find((leg) => leg.type === "income");
  if (first === undefined || expense === undefined || income === undefined) return null;

  const groupId = first.transferGroupId ?? "";
  const canReverse = first.status === "posted";
  const accountName = (id: string): string =>
    accounts.find((account) => account.id === id)?.name ?? "Archived account";
  const statusLabel =
    first.status === "posted" ? "Posted" : first.status === "reversed" ? "Reversed" : "Reversal";
  const reverseNote =
    first.status === "reversed"
      ? "This transfer has already been reversed."
      : "This is a reversal transfer and cannot be reversed again.";

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-detail-title"
          className="h-screen w-full max-w-md overflow-y-auto border-l border-border bg-surface-elevated p-7 animate-drawer-in"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p
                id="transfer-detail-title"
                className="font-mono text-xs font-semibold tracking-wider text-foreground-muted uppercase"
              >
                Transfer · {groupId}
              </p>
              <div className="mt-1">
                <Money minor={first.amountMinor} size="lg" />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>

          <p className="mt-5 rounded-xl border border-border bg-surface-muted px-4 py-3.5 text-sm leading-relaxed text-foreground-muted">
            Transfers are edited and reversed as a group. Individual legs can&apos;t be edited or
            reversed on their own.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <div className="rounded-xl border border-border bg-surface p-4.5">
              <p className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
                From · Expense leg
              </p>
              <p className="mt-2 text-base font-semibold text-foreground">
                {accountName(expense.accountId)}
              </p>
              <div className="mt-1">
                <Money minor={expense.amountMinor} variant="expense" signed size="md" />
              </div>
            </div>
            <div className="text-center font-mono text-base text-accent" aria-hidden="true">
              ↓
            </div>
            <div className="rounded-xl border border-border bg-surface p-4.5">
              <p className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
                To · Income leg
              </p>
              <p className="mt-2 text-base font-semibold text-foreground">
                {accountName(income.accountId)}
              </p>
              <div className="mt-1">
                <Money minor={income.amountMinor} variant="income" signed size="md" />
              </div>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 border-t border-border pt-4.5">
            <dt className="text-sm text-foreground-muted">Date</dt>
            <dd className="text-right text-sm font-medium text-foreground">
              {dateFormatter.format(first.occurredAt)}
            </dd>
            <dt className="text-sm text-foreground-muted">Description</dt>
            <dd className="text-right text-sm font-medium text-foreground">{first.description}</dd>
            <dt className="text-sm text-foreground-muted">Status</dt>
            <dd className="text-right text-sm font-medium text-foreground">{statusLabel}</dd>
            <dt className="text-sm text-foreground-muted">Group ID</dt>
            <dd className="text-right font-mono text-sm text-foreground">{groupId}</dd>
          </dl>

          {first.tags.length === 0 ? null : (
            <div className="mt-4.5 flex flex-wrap gap-1.5">
              {first.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-border bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {canReverse ? (
            <button
              type="button"
              onClick={() => setReverseOpen(true)}
              className="mt-6.5 w-full rounded-xl border border-expense/35 py-3.5 text-sm font-semibold text-expense hover:bg-expense/10"
            >
              Reverse transfer
            </button>
          ) : (
            <p className="mt-6.5 text-center text-sm leading-relaxed text-foreground-muted">
              {reverseNote}
            </p>
          )}
        </div>
      </div>

      {reverseOpen ? (
        <ReverseConfirmDialog
          title="Reverse this transfer?"
          body="Both legs reverse together as one action — a new compensating pair is posted, and this transfer is marked reversed. This can't be undone."
          isPending={reverse.isPending}
          onCancel={() => setReverseOpen(false)}
          onConfirm={() => {
            reverse.mutate(groupId);
            setReverseOpen(false);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
