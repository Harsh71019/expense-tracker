"use client";

import { formatSignedCompactMinor, type NetWorth } from "@vyaya/shared";
import type { ReactNode } from "react";

import { SignedMoney } from "@/components/ui/money";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

export function NetWorthHero({ netWorth }: Readonly<{ netWorth: NetWorth }>): ReactNode {
  const accountsMinor = netWorth.accounts.reduce((sum, account) => sum + account.balanceMinor, 0);
  const assetsMinor = netWorth.assets.reduce((sum, asset) => sum + asset.valueMinor, 0);
  const positiveAssets = netWorth.assets.filter((asset) => asset.valueMinor >= 0);
  const liabilities = netWorth.assets.filter((asset) => asset.valueMinor < 0);
  const assetsTotal = positiveAssets.reduce((sum, asset) => sum + asset.valueMinor, 0);
  const liabTotal = liabilities.reduce((sum, asset) => sum + asset.valueMinor, 0);

  return (
    <section className="relative overflow-hidden rounded-[22px] border border-border bg-surface-elevated p-7.5 sm:p-8.5">
      <div
        className="pointer-events-none absolute -top-20 -right-10 h-80 w-80 rounded-full bg-accent-glow blur-3xl"
        aria-hidden="true"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-8">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-[1.5px] text-foreground-muted">
            TOTAL NET WORTH
          </p>
          <div className="mt-2.5">
            <SignedMoney minor={netWorth.netWorthMinor} size="hero" />
          </div>
          <p className="mt-2 text-[13px] font-medium text-foreground-muted">
            as of {dateFormatter.format(netWorth.asOf)} · {formatSignedCompactMinor(accountsMinor)}
            in accounts + {formatSignedCompactMinor(assetsMinor)} in assets
          </p>
        </div>
        <div className="flex flex-wrap gap-3.5">
          <div className="min-w-32 rounded-2xl border border-border bg-surface-muted px-5 py-4">
            <p className="font-mono text-[10px] font-semibold tracking-wider text-foreground-muted">
              ASSETS
            </p>
            <p className="mt-1.5 font-mono text-xl font-bold tracking-tight text-foreground">
              {formatSignedCompactMinor(assetsTotal)}
            </p>
            <p className="mt-1 text-[11px] font-medium text-foreground-muted">
              {positiveAssets.length} open
            </p>
          </div>
          <div className="min-w-32 rounded-2xl border border-border bg-surface-muted px-5 py-4">
            <p className="font-mono text-[10px] font-semibold tracking-wider text-foreground-muted">
              LIABILITIES
            </p>
            <p
              className={`mt-1.5 font-mono text-xl font-bold tracking-tight ${liabTotal < 0 ? "text-expense" : "text-foreground"}`}
            >
              {formatSignedCompactMinor(liabTotal)}
            </p>
            <p className="mt-1 text-[11px] font-medium text-foreground-muted">
              {liabilities.length} loans owed
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
