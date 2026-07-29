"use client";

import type { Account, AccountType } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SignedMoney } from "@/components/ui/money";
import { toast } from "@/lib/toast";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata"
});

const typeLabels: Record<AccountType, string> = {
  bank: "Bank",
  credit_card: "Credit card",
  cash: "Cash",
  wallet: "Wallet",
  investment: "Investment"
};

export function AccountDetailDialog({
  account,
  onClose
}: Readonly<{ account: Account; onClose: () => void }>): ReactNode {
  async function copyId(): Promise<void> {
    try {
      await navigator.clipboard.writeText(account.id);
      toast.success("Account ID copied");
    } catch {
      toast.error("Could not copy this ID");
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid items-start justify-items-center overflow-y-auto overscroll-contain bg-black/60 p-4 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-detail-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface-elevated p-6 shadow-glow-strong animate-scale-up sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
              {typeLabels[account.type]}
              {account.isArchived ? " · Archived" : ""}
            </p>
            <h2
              id="account-detail-title"
              className="mt-1 truncate text-xl font-bold text-foreground"
            >
              {account.name}
            </h2>
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

        <dl className="mt-5 grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 border-y border-border py-4.5">
          <dt className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
            Balance
          </dt>
          <dd className="text-right text-sm font-semibold text-foreground">
            <SignedMoney minor={account.balanceMinor} size="sm" />
          </dd>
          <dt className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
            Opening balance
          </dt>
          <dd className="text-right text-sm font-semibold text-foreground">
            <SignedMoney minor={account.openingBalanceMinor} size="sm" />
          </dd>
          <dt className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
            Currency
          </dt>
          <dd className="text-right text-sm font-semibold text-foreground">{account.currency}</dd>
          <dt className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
            Created
          </dt>
          <dd className="text-right text-sm font-semibold text-foreground">
            {dateFormatter.format(account.createdAt)}
          </dd>
        </dl>

        <div className="mt-5">
          <p className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Account ID
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-foreground-muted">
            Use this to target the account from external automation, e.g. an n8n workflow.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
              {account.id}
            </code>
            <Button type="button" variant="secondary" onClick={() => void copyId()}>
              Copy
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
