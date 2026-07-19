"use client";

import type { MonthlyRollup } from "@vyaya/shared";
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
  const [month, setMonth] = useState(initialMonth);
  const rollupQuery = useMonthlyRollup(month, month === initialMonth ? initialRollup : undefined);
  const accounts = useAccounts();
  const categories = useCategories();

  const today = currentMonthInIndia();
  const months = recentMonths(today, MONTH_CHIP_COUNT);
  const rollup = rollupQuery.data;

  return (
    <section>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[2px] text-accent">
            LEDGER · REPORTS
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Monthly report
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground-muted">
            Where your money went, month by month. Pre-computed summaries — a snapshot, not a live
            query.
          </p>
        </div>
      </header>

      <div className="mt-6">
        <MonthSelector
          months={months}
          selected={month}
          canGoNext={month < today}
          onSelect={setMonth}
          onPrev={() => setMonth((current) => shiftMonth(current, -1))}
          onNext={() => setMonth((current) => shiftMonth(current, 1))}
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
