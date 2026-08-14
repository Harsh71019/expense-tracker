"use client";

import type { RecurringStats } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money, SignedMoney } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { IconGlyph } from "@/features/categories";

import { useRecurringStats } from "../hooks/use-recurring-stats";

const countFormatter = new Intl.NumberFormat("en-IN");
const cardClass =
  "glass-card min-w-0 rounded-2xl p-4.5 shadow-xs transition-all duration-200 hover:border-accent/40 sm:p-5";
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
    <section aria-label="Recurring insights" className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Total Rules */}
        <article className={cardClass}>
          <div className="flex items-center justify-between">
            <p className={labelClass}>Total recurring rules</p>
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent/25 bg-accent-glow/40 font-mono text-xs text-accent">
              ↻
            </span>
          </div>
          <p className="mt-2.5 font-mono text-3xl font-bold tracking-tight text-foreground">
            {countFormatter.format(stats.totalRules)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md border border-income/30 bg-income/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-income">
              <span className="h-1.5 w-1.5 rounded-full bg-income" aria-hidden="true" />
              <strong className="text-income">{stats.activeRules}</strong> active
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-surface-muted/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground-muted">
              <strong className="text-foreground">{stats.pausedRules}</strong> paused
            </span>
          </div>
        </article>

        {/* Card 2: Upcoming Transactions */}
        <article className={cardClass}>
          <div className="flex items-center justify-between">
            <p className={labelClass}>Upcoming transactions · {stats.forecastDays} days</p>
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-border/80 bg-surface-muted font-mono text-xs text-foreground-muted">
              📅
            </span>
          </div>
          <p className="mt-2.5 font-mono text-3xl font-bold tracking-tight text-foreground">
            {countFormatter.format(stats.upcomingTransactionCount)}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-foreground-muted">
            Scheduled postings from active recurring rules.
          </p>
        </article>

        {/* Card 3: Forecast Cash Flow */}
        <article className={cardClass}>
          <div className="flex items-center justify-between">
            <p className={labelClass}>Forecast cash flow · {stats.forecastDays} days</p>
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-expense/25 bg-expense/10 font-mono text-xs text-expense">
              ⇄
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-3">
            <Money minor={stats.upcomingExpenseMinor} variant="expense" signed size="lg" />
            <span className="font-mono text-xs font-semibold text-foreground-muted">out</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-xs text-foreground-muted">
            <span>
              <Money minor={stats.upcomingIncomeMinor} variant="income" signed size="sm" /> in
            </span>
            <span>
              Net <SignedMoney minor={stats.upcomingNetMinor} size="sm" />
            </span>
          </div>
        </article>

        {/* Card 4: Top Spending Category */}
        <article aria-label="Highest spending category forecast" className={cardClass}>
          <div className="flex items-center justify-between">
            <p className={labelClass}>Highest spending category · {stats.forecastDays} days</p>
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-border/80 bg-surface-muted font-mono text-xs text-foreground-muted">
              🏷
            </span>
          </div>
          {topCategory === null ? (
            <>
              <p className="mt-2.5 font-mono text-3xl font-bold text-foreground-muted">—</p>
              <p className="mt-3 text-xs text-foreground-muted">No scheduled expenses.</p>
            </>
          ) : (
            <>
              <div className="mt-2 flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted shadow-2xs"
                  style={topCategory.color === undefined ? undefined : { color: topCategory.color }}
                >
                  <IconGlyph value={topCategory.icon ?? "●"} size={16} />
                </span>
                <p className="truncate text-base font-bold text-foreground">{topCategory.name}</p>
              </div>
              <p className="mt-2">
                <Money minor={topCategory.amountMinor} size="lg" />
              </p>
              <p className="mt-0.5 text-xs text-foreground-muted">
                across {countFormatter.format(topCategory.transactionCount)} scheduled{" "}
                {topCategory.transactionCount === 1 ? "expense" : "expenses"}
              </p>
            </>
          )}
        </article>
      </div>

      <TwelveMonthCostPanel forecast={stats.twelveMonthForecast} />
    </section>
  );
}

function TwelveMonthCostPanel({
  forecast
}: Readonly<{ forecast: RecurringStats["twelveMonthForecast"] }>): ReactNode {
  const expenseRules = forecast.ruleProjections.filter(
    (projection) => projection.type === "expense" && projection.occurrenceCount > 0
  );
  const largestExpense = expenseRules[0];

  return (
    <article
      aria-label="12-month recurring cost"
      className="glass-card relative overflow-hidden rounded-2xl border-expense/30 shadow-xs"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-expense shadow-glow" />
      <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* Left Column: Annual Runway Overview */}
        <div className="border-b border-border/80 p-5.5 sm:p-6 lg:border-r lg:border-b-0 lg:p-7">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-expense/30 bg-expense/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-expense uppercase">
              12-Month Runway
            </span>
          </div>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Recurring commitments
          </h2>
          <p className="mt-4">
            <Money minor={forecast.expenseMinor} variant="expense" size="hero" />
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            scheduled to leave over the next {forecast.forecastMonths} months
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/70 bg-surface-muted/60 p-3.5">
              <dt className={labelClass}>Monthly equivalent</dt>
              <dd className="mt-2">
                <Money minor={forecast.monthlyExpenseAverageMinor} size="md" />
              </dd>
            </div>
            <div className="rounded-xl border border-border/70 bg-surface-muted/60 p-3.5">
              <dt className={labelClass}>Scheduled charges</dt>
              <dd className="mt-2 font-mono text-base font-bold tabular-nums text-foreground">
                {countFormatter.format(
                  expenseRules.reduce((total, projection) => total + projection.occurrenceCount, 0)
                )}
              </dd>
            </div>
          </dl>

          {largestExpense === undefined ? (
            <p className="mt-5 rounded-xl border border-border/70 bg-surface-muted/50 px-4 py-3 text-xs leading-relaxed text-foreground-muted">
              No active recurring expenses fall within the next 12 months.
            </p>
          ) : (
            <p className="mt-5 rounded-xl border border-expense/25 bg-expense/10 px-4 py-3 text-xs leading-relaxed text-foreground-muted">
              Your largest commitment is{" "}
              <strong className="text-foreground font-bold">{largestExpense.description}</strong> at{" "}
              <Money minor={largestExpense.projectedMinor} size="sm" /> over 12 months.
            </p>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-foreground-muted">
            Projection uses active rules only. Paused rules and one-off spending are excluded.
          </p>
        </div>

        {/* Right Column: Ranked Commitments by Rule */}
        <div className="p-5.5 sm:p-6 lg:p-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className={labelClass}>Annual cost by rule</p>
              <p className="mt-1 text-xs text-foreground-muted">
                Every active expense due in the window, ranked by its 12-month impact.
              </p>
            </div>
            {forecast.incomeMinor > 0 ? (
              <p className="shrink-0 text-right text-xs text-foreground-muted">
                Recurring income
                <br />
                <Money minor={forecast.incomeMinor} variant="income" size="sm" />
              </p>
            ) : null}
          </div>

          {expenseRules.length === 0 ? (
            <div className="mt-5 grid min-h-32 place-items-center rounded-xl border border-dashed border-border bg-surface-muted/40 px-4 text-center text-xs text-foreground-muted">
              Add an active expense rule to see its annual cost here.
            </div>
          ) : (
            <ol className="mt-4 max-h-[28rem] space-y-2.5 overflow-y-auto pr-1 custom-scrollbar">
              {expenseRules.map((projection, index) => {
                const percentage =
                  forecast.expenseMinor > 0
                    ? Math.round((projection.projectedMinor / forecast.expenseMinor) * 100)
                    : 0;

                return (
                  <li
                    key={projection.recurringRuleId}
                    className="group rounded-xl border border-border/70 bg-surface-muted/45 p-3.5 transition-all hover:border-accent/40 hover:bg-surface-elevated/70"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-surface-elevated font-mono text-[10px] font-bold text-foreground-muted group-hover:border-accent/30 group-hover:text-accent"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-foreground">
                              {projection.description}
                            </p>
                            <p className="mt-0.5 text-xs text-foreground-muted">
                              {countFormatter.format(projection.occurrenceCount)} ×{" "}
                              <Money minor={projection.amountMinor} size="sm" />
                            </p>
                          </div>
                          <div className="shrink-0 sm:text-right">
                            <Money minor={projection.projectedMinor} variant="expense" size="md" />
                            <span className="ml-1 text-[10px] text-foreground-muted">/ 12 mo</span>
                            <span className="ml-1.5 inline-block font-mono text-[10px] font-semibold text-foreground-muted">
                              ({percentage}%)
                            </span>
                          </div>
                        </div>
                        <progress
                          aria-label={`${projection.description} share of recurring expenses`}
                          max={forecast.expenseMinor}
                          value={projection.projectedMinor}
                          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted [&::-moz-progress-bar]:bg-expense/80 [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:bg-expense/80"
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </article>
  );
}

function RecurringStatsSkeleton(): ReactNode {
  return (
    <div aria-label="Loading recurring insights" className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={cardClass}>
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-4 h-8 w-24" />
            <Skeleton className="mt-4 h-5 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 rounded-2xl border border-border bg-surface-elevated p-6 lg:grid-cols-2">
        <div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-12 w-56" />
          <Skeleton className="mt-4 h-16 w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
