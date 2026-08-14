"use client";

import type { Account, AccountType } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
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

function fallbackCopyTextToClipboard(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

export function AccountDetailDialog({
  account,
  onClose
}: Readonly<{ account: Account; onClose: () => void }>): ReactNode {
  async function copyId(): Promise<void> {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard !== undefined &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      try {
        await navigator.clipboard.writeText(account.id);
        toast.success("Account ID copied");
        return;
      } catch {
        // If navigator.clipboard fails (e.g., non-HTTPS HTTP environment or permission denial), try fallback
      }
    }

    if (fallbackCopyTextToClipboard(account.id)) {
      toast.success("Account ID copied");
    } else {
      toast.error("Could not copy this ID");
    }
  }

  return (
    <DialogSurface labelledBy="account-detail-title" onClose={onClose} panelClassName="max-w-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            {typeLabels[account.type]}
            {account.isArchived ? " · Archived" : ""}
          </p>
          <h2 id="account-detail-title" className="mt-1 truncate text-xl font-bold text-foreground">
            {account.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close account details"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <dl className="mt-5 grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 border-y border-border py-4.5">
        <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
          Balance
        </dt>
        <dd className="text-right text-sm font-semibold text-foreground">
          <SignedMoney minor={account.balanceMinor} size="sm" />
        </dd>
        <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
          Opening balance
        </dt>
        <dd className="text-right text-sm font-semibold text-foreground">
          <SignedMoney minor={account.openingBalanceMinor} size="sm" />
        </dd>
        <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
          Currency
        </dt>
        <dd className="text-right text-sm font-semibold text-foreground">{account.currency}</dd>
        <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
          Created
        </dt>
        <dd className="text-right text-sm font-semibold text-foreground">
          {dateFormatter.format(account.createdAt)}
        </dd>
      </dl>

      <div className="mt-5">
        <p className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
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
    </DialogSurface>
  );
}
