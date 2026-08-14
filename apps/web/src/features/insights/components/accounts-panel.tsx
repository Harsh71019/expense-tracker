import type { Account } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { SignedMoney } from "@/components/ui/money";

import { ACCOUNT_TYPE_META } from "./create-account-sheet";

type AccountsPanelProps = Readonly<{
  accounts: Account[];
  onAddAccount: () => void;
}>;

export function AccountsPanel({ accounts, onAddAccount }: AccountsPanelProps): ReactNode {
  const active = accounts.filter((account) => !account.isArchived);

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-5.5">
      <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-bold tracking-tight text-foreground">Accounts</h2>
        <button
          type="button"
          onClick={onAddAccount}
          className="min-h-11 rounded-lg border border-border bg-accent-glow px-3 py-1.5 font-mono text-2xs font-bold text-accent transition-colors duration-150 hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          + Add account
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {active.map((account) => {
          const meta = ACCOUNT_TYPE_META.find((entry) => entry.value === account.type);
          return (
            <div
              key={account.id}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-surface-muted"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-lg">
                {meta?.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{account.name}</p>
                <p className="mt-0.5 font-mono text-2xs tracking-wider text-foreground-muted uppercase">
                  {meta?.label}
                </p>
              </div>
              <SignedMoney minor={account.balanceMinor} size="md" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
