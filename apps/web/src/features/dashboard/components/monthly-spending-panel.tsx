"use client";

import { formatMinor, type MonthlySpending } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { usePrivacy } from "@/lib/privacy/privacy-context";

import { DailySpendingChart } from "./daily-spending-chart";
import { WeeklySpendingChart } from "./weekly-spending-chart";

const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  month: "long",
  year: "numeric"
});
const asOfFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short"
});

export function MonthlySpendingPanel({
  spending
}: Readonly<{ spending: MonthlySpending }>): ReactNode {
  const { privacyMode } = usePrivacy();
  const firstDay = spending.daily[0]?.date ?? spending.asOf;
  const daysElapsed = spending.daily.filter(
    (bucket) => bucket.date.getTime() <= spending.asOf.getTime()
  ).length;
  const visibleTotal = privacyMode ? "₹ ••••••" : formatMinor(spending.totalMinor);

  return (
    <section
      aria-labelledby="monthly-spending-heading"
      className="overflow-hidden rounded-2xl border border-border bg-surface-elevated"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
        <div>
          <p className="font-mono text-2xs font-semibold tracking-[1.4px] text-accent">
            {monthFormatter.format(firstDay).toUpperCase()} · LIVE LEDGER
          </p>
          <h2
            id="monthly-spending-heading"
            className="mt-1.5 text-lg font-bold tracking-tight text-foreground"
          >
            This month&apos;s spending rhythm
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Weekly pace and every calendar day, updated through{" "}
            {asOfFormatter.format(spending.asOf)}.
          </p>
        </div>
        <p className="font-mono text-2xs tracking-[1px] text-foreground-muted">
          {daysElapsed} OF {spending.daily.length} DAYS ELAPSED
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)]">
        <aside className="relative overflow-hidden border-b border-border bg-surface-muted/55 p-6 lg:border-r lg:border-b-0">
          <div
            className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-expense/10 blur-3xl"
            aria-hidden="true"
          />
          <p className="relative font-mono text-2xs font-semibold tracking-[1.4px] text-foreground-muted">
            TOTAL SPEND · MONTH TO DATE
          </p>
          <p className="relative mt-4 break-words font-mono text-[clamp(1.8rem,4vw,2.7rem)] font-bold tracking-[-0.05em] text-foreground">
            {visibleTotal}
          </p>
          <p className="relative mt-3 text-sm text-foreground-muted">
            Posted expenses through {asOfFormatter.format(spending.asOf)}.
          </p>
          <div className="relative mt-7 flex items-center gap-2 border-t border-border pt-4 font-mono text-2xs text-foreground-muted">
            <span className="h-2 w-2 rounded-full bg-expense" aria-hidden="true" />
            CURRENT MONTH · IST
          </div>
        </aside>

        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">Weekly spending</h3>
              <p className="mt-1 text-xs text-foreground-muted">Seven-day ledger blocks to date</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
              <span className="h-2 w-2 rounded-full bg-expense" aria-hidden="true" />
              Spend
            </span>
          </div>
          <div className="mt-3">
            <WeeklySpendingChart buckets={spending.weekly} privacyMode={privacyMode} />
          </div>
        </div>
      </div>

      <div className="border-t border-border px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">Daily spending</h3>
            <p className="mt-1 text-xs text-foreground-muted">
              One bar per day; upcoming dates stay muted.
            </p>
          </div>
          <p className="font-mono text-2xs text-foreground-muted">DAY OF MONTH →</p>
        </div>
        <div className="mt-4 overflow-x-auto pb-1">
          <DailySpendingChart
            buckets={spending.daily}
            asOf={spending.asOf}
            privacyMode={privacyMode}
          />
        </div>
      </div>
    </section>
  );
}
