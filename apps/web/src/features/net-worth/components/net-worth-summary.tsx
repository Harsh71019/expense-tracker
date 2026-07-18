"use client";

import type { NetWorth } from "@vyaya/shared";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { SignedMoney } from "@/components/ui/money";
import { assetKindLabel } from "@/features/assets/model/asset-form";

import { useNetWorth } from "../hooks/use-net-worth";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata"
});

export function NetWorthSummary({ initialData }: { initialData: NetWorth }): ReactNode {
  const query = useNetWorth(initialData);
  const summary = query.data ?? initialData;
  const isEmpty = summary.accounts.length === 0 && summary.assets.length === 0;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Net worth</h1>
      </header>

      <div className="relative overflow-hidden rounded-xl border border-border bg-surface-elevated p-6 sm:p-8">
        <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden="true" />
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-foreground-muted uppercase">
          Current snapshot
        </p>
        <div className="mt-2.5">
          <SignedMoney minor={summary.netWorthMinor} size="hero" />
        </div>
        <p className="mt-3 text-sm text-foreground-muted">
          As of {dateTime.format(summary.asOf)} · Asia/Kolkata
        </p>
      </div>

      {isEmpty ? (
        <EmptyState
          title="Nothing to total yet"
          description="Add an account or asset to build your current net-worth snapshot."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Breakdown title="Accounts">
            {summary.accounts.map((account) => (
              <BreakdownRow
                key={account.accountId}
                label={account.name}
                minor={account.balanceMinor}
              />
            ))}
          </Breakdown>
          <Breakdown title="Assets and liabilities">
            {summary.assets.length === 0 ? (
              <p className="text-sm text-foreground-muted">No active assets.</p>
            ) : (
              summary.assets.map((asset) => (
                <BreakdownRow
                  key={asset.assetId}
                  label={asset.name}
                  minor={asset.valueMinor}
                  detail={`${assetKindLabel(asset.kind)} · ${
                    asset.valuedAt === null ? "No valuation" : dateTime.format(asset.valuedAt)
                  }`}
                />
              ))
            )}
          </Breakdown>
        </div>
      )}
    </section>
  );
}

function Breakdown({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-4 divide-y divide-border">{children}</div>
    </section>
  );
}

function BreakdownRow({
  label,
  minor,
  detail
}: {
  label: string;
  minor: number;
  detail?: string;
}): ReactNode {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="font-medium">{label}</p>
        {detail === undefined ? null : (
          <p className="mt-1 text-xs text-foreground-muted">{detail}</p>
        )}
      </div>
      <SignedMoney minor={minor} />
    </div>
  );
}
