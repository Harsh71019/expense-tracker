import type { Account } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money, SignedMoney } from "@/components/ui/money";

type BalanceCardProps = Readonly<{ accounts: Account[] }>;

export function BalanceCard({ accounts }: BalanceCardProps): ReactNode {
  const active = accounts.filter((account) => !account.isArchived);
  const total = active.reduce((sum, account) => sum + account.balanceMinor, 0);
  const assets = active
    .filter((account) => account.balanceMinor >= 0)
    .reduce((sum, account) => sum + account.balanceMinor, 0);
  const liabilities = active
    .filter((account) => account.balanceMinor < 0)
    .reduce((sum, account) => sum + account.balanceMinor, 0);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated p-7">
      <span
        className="pointer-events-none absolute -top-20 -right-12 h-64 w-64 rounded-full bg-accent-glow blur-3xl"
        aria-hidden="true"
      />
      <div className="relative">
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-foreground-muted uppercase">
          Total balance · {active.length} active {active.length === 1 ? "account" : "accounts"}
        </p>
        <div className="mt-2.5">
          <SignedMoney minor={total} size="hero" />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
          <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-income">
            <span aria-hidden="true">▲</span>
            <Money minor={assets} size="sm" className="text-income" />
            assets
          </span>
          <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-expense">
            <span aria-hidden="true">▼</span>
            <Money minor={Math.abs(liabilities)} size="sm" className="text-expense" />
            owed
          </span>
        </div>
      </div>
    </div>
  );
}
