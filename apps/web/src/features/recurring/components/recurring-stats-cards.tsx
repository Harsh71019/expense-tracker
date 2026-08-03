"use client";

import type { RecurringStats } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money, SignedMoney } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { IconGlyph } from "@/features/categories";

import { useRecurringStats } from "../hooks/use-recurring-stats";

const countFormatter = new Intl.NumberFormat("en-IN");
const cardClass =
  "min-w-0 rounded-2xl border border-border/80 bg-surface-elevated/90 p-5 shadow-sm transition-colors duration-200 hover:border-accent/35";
const labelClass =
  "font-mono text-[10px] font-bold tracking-[0.14em] text-foreground-muted uppercase";

export function RecurringStatsCards({
  initialStats
}: Readonly<{ initialStats: RecurringStats | null }>): ReactNode {
  const statsQuery = useRecurringStats(initialStats);
  const stats = statsQuery.data;

  if (stats === undefined) {
    if (statsQuery.isError) {
      return (
        <p
          role="alert"
          className="rounded-xl border border-expense/25 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          Recurring insights could not be loaded. Your rules are still available below.
        </p>
      );
    }
    return <RecurringStatsSkeleton />;
  }

  const topCategory = stats.topSpendingCategory;
  return (
    <section
      aria-label="Recurring insights"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <article className={cardClass}>
        <p className={labelClass}>Total recurring rules</p>
        <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-foreground">
          {countFormatter.format(stats.totalRules)}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-muted">
          <span>
            <strong className="text-income">{stats.activeRules}</strong> active
          </span>
          <span>
            <strong className="text-foreground">{stats.pausedRules}</strong> paused
          </span>
        </div>
      </article>

      <article className={cardClass}>
        <p className={labelClass}>Upcoming transactions · {stats.forecastDays} days</p>
        <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-foreground">
          {countFormatter.format(stats.upcomingTransactionCount)}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-foreground-muted">
          Scheduled postings from active recurring rules.
        </p>
      </article>

      <article className={cardClass}>
        <p className={labelClass}>Forecast cash flow · {stats.forecastDays} days</p>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <Money minor={stats.upcomingExpenseMinor} variant="expense" signed size="lg" />
          <span className="text-xs text-foreground-muted">out</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-foreground-muted">
          <span>
            <Money minor={stats.upcomingIncomeMinor} variant="income" signed size="sm" /> in
          </span>
          <span>
            Net <SignedMoney minor={stats.upcomingNetMinor} size="sm" />
          </span>
        </div>
      </article>

      <article className={cardClass}>
        <p className={labelClass}>Highest spending category · {stats.forecastDays} days</p>
        {topCategory === null ? (
          <>
            <p className="mt-3 font-mono text-3xl font-bold text-foreground-muted">—</p>
            <p className="mt-3 text-xs text-foreground-muted">No scheduled expenses.</p>
          </>
        ) : (
          <>
            <div className="mt-3 flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted"
                style={topCategory.color === undefined ? undefined : { color: topCategory.color }}
              >
                <IconGlyph value={topCategory.icon ?? "●"} size={16} />
              </span>
              <p className="truncate text-lg font-bold text-foreground">{topCategory.name}</p>
            </div>
            <p className="mt-3">
              <Money minor={topCategory.amountMinor} size="lg" />
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              across {countFormatter.format(topCategory.transactionCount)} scheduled{" "}
              {topCategory.transactionCount === 1 ? "expense" : "expenses"}
            </p>
          </>
        )}
      </article>
    </section>
  );
}

function RecurringStatsSkeleton(): ReactNode {
  return (
    <div
      aria-label="Loading recurring insights"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className={cardClass}>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-8 w-24" />
          <Skeleton className="mt-4 h-5 w-full" />
        </div>
      ))}
    </div>
  );
}
