"use client";

import type { MonthlyRollup } from "@treasury-ops/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";

import { useMonthlyRollup } from "../hooks/use-monthly-rollup";
import { currentMonthInIndia, recentMonths, shiftMonth } from "../model/month";
import { AccountFlowPanel } from "./account-flow-panel";
import { CategoryBreakdownPanel } from "./category-breakdown-panel";
import { MonthSelector } from "./month-selector";
import { ReportEmptyState } from "./report-empty-state";
import { ReportTotals } from "./report-totals";
import { SpendByCategoryPanel } from "./spend-by-category-panel";

const MONTH_CHIP_COUNT = 8;

const computedAtFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata"
});

type ReportPageProps = Readonly<{ initialMonth: string; initialRollup: MonthlyRollup | null }>;

export function ReportPage({ initialMonth, initialRollup }: ReportPageProps): ReactNode {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const rollupQuery = useMonthlyRollup(month, month === initialMonth ? initialRollup : undefined);
  const accounts = useAccounts();
  const categories = useCategories();

  const today = currentMonthInIndia();
  const months = recentMonths(today, MONTH_CHIP_COUNT);
  const rollup = rollupQuery.data;

  function selectMonth(nextMonth: string): void {
    setMonth(nextMonth);
    router.replace(`/reports?month=${encodeURIComponent(nextMonth)}`, { scroll: false });
  }

  return (
    <section className="space-y-4.5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Monthly report
          </h1>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Consumption, asset funding, and cash-flow rollups.
          </p>
        </div>
        <Link
          href="/budgets"
          className="inline-flex min-h-10 items-center rounded-lg border border-border bg-surface-elevated px-3.5 py-2 text-xs font-semibold text-foreground hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Monthly budgets
        </Link>
      </header>

      <Link
        href="/spending-warnings"
        className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3.5 transition-colors duration-150 hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">Spending patterns</span>
          <span className="block text-xs text-foreground-muted">
            See unusual spending patterns worth a look
          </span>
        </span>
        <span aria-hidden="true" className="text-accent">
          →
        </span>
      </Link>

      <div className="mt-6">
        <MonthSelector
          months={months}
          selected={month}
          canGoNext={month < today}
          onSelect={selectMonth}
          onPrev={() => selectMonth(shiftMonth(month, -1))}
          onNext={() => selectMonth(shiftMonth(month, 1))}
        />

        {rollupQuery.isLoading ? (
          <p className="py-16 text-center text-sm text-foreground-muted">Loading…</p>
        ) : rollup === null || rollup === undefined ? (
          <ReportEmptyState month={month} isInProgress={month >= today} />
        ) : (
          <>
            <p className="mb-4.5 font-mono text-[12.5px] text-foreground-muted">
              Computed {computedAtFormatter.format(rollup.computedAt)} · this is a cached rollup,
              not recalculated live
            </p>
            <ReportTotals rollup={rollup} />
            <div className="grid grid-cols-1 gap-4.5 lg:grid-cols-[340px_1fr]">
              <SpendByCategoryPanel rollup={rollup} categories={categories.data ?? []} />
              <div className="flex flex-col gap-4.5">
                <CategoryBreakdownPanel rollup={rollup} categories={categories.data ?? []} />
                <AccountFlowPanel rollup={rollup} accounts={accounts.data ?? []} />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
