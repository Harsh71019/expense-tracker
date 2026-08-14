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
    <section aria-label="Recurring insights" className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

        <article aria-label="Highest spending category forecast" className={cardClass}>
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
      className="relative overflow-hidden rounded-2xl border border-expense/25 bg-surface-elevated shadow-sm"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-expense/70" />
      <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="border-b border-border/80 p-6 lg:border-r lg:border-b-0 lg:p-7">
          <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-expense uppercase">
            12-month runway
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground">
            Recurring commitments
          </h2>
          <p className="mt-5">
            <Money minor={forecast.expenseMinor} variant="expense" size="hero" />
          </p>
          <p className="mt-1 text-sm text-foreground-muted">
            scheduled to leave over the next {forecast.forecastMonths} months
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-3">
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
            <p className="mt-5 rounded-xl border border-border/70 bg-surface-muted/50 px-4 py-3 text-sm leading-relaxed text-foreground-muted">
              No active recurring expenses fall within the next 12 months.
            </p>
          ) : (
            <p className="mt-5 rounded-xl border border-expense/20 bg-expense/10 px-4 py-3 text-sm leading-relaxed text-foreground-muted">
              Your largest commitment is{" "}
              <strong className="text-foreground">{largestExpense.description}</strong> at{" "}
              <Money minor={largestExpense.projectedMinor} size="sm" /> over 12 months.
            </p>
          )}

          <p className="mt-4 text-xs leading-relaxed text-foreground-muted">
            Projection uses active rules only. Paused rules and one-off spending are excluded.
          </p>
        </div>

        <div className="p-6 lg:p-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className={labelClass}>Annual cost by rule</p>
              <p className="mt-1 text-sm text-foreground-muted">
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
            <div className="mt-6 grid min-h-32 place-items-center rounded-xl border border-dashed border-border bg-surface-muted/40 px-4 text-center text-sm text-foreground-muted">
              Add an active expense rule to see its annual cost here.
            </div>
          ) : (
            <ol className="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {expenseRules.map((projection, index) => (
                <li
                  key={projection.recurringRuleId}
                  className="rounded-xl border border-border/70 bg-surface-muted/45 p-4"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-surface-elevated font-mono text-[10px] font-bold text-foreground-muted"
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
                        <p className="shrink-0 sm:text-right">
                          <Money minor={projection.projectedMinor} variant="expense" size="md" />
                          <span className="ml-1 text-[10px] text-foreground-muted">/ 12 mo</span>
                        </p>
                      </div>
                      <progress
                        aria-label={`${projection.description} share of recurring expenses`}
                        max={forecast.expenseMinor}
                        value={projection.projectedMinor}
                        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted [&::-moz-progress-bar]:bg-expense/70 [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:bg-expense/70"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </article>
  );
}

function RecurringStatsSkeleton(): ReactNode {
  return (
    <div aria-label="Loading recurring insights" className="space-y-3">
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
