"use client";

import { formatMinor, type TransactionInsights } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { IconGlyph } from "@/features/categories";
import { usePrivacy } from "@/lib/privacy/privacy-context";

import { useTransactionInsights } from "../hooks/use-transaction-insights";
import { TransactionActivityChart } from "./transaction-activity-chart";

const countFormatter = new Intl.NumberFormat("en-IN");
const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

const cardClass =
  "min-w-0 rounded-2xl border border-border/80 bg-surface-elevated/90 p-5 shadow-sm transition-colors duration-200 hover:border-accent/35";
const labelClass = "font-mono text-2xs font-bold tracking-[0.14em] text-foreground-muted uppercase";

export function TransactionInsightsCards({
  initialInsights
}: Readonly<{ initialInsights: TransactionInsights | null }>): ReactNode {
  const insightsQuery = useTransactionInsights(initialInsights);
  const { privacyMode } = usePrivacy();
  const insights = insightsQuery.data;

  if (insights === undefined) {
    if (insightsQuery.isError) {
      return (
        <p
          className="mb-6 rounded-xl border border-expense/25 bg-expense/10 px-4 py-3 text-sm text-expense"
          role="alert"
        >
          Transaction insights could not be loaded. The ledger is still available below.
        </p>
      );
    }
    return <InsightsSkeleton />;
  }

  const monthLabel = monthFormatter.format(new Date(`${insights.month}-15T12:00:00.000Z`));
  const highestExpense = insights.highestExpense;
  const topCategory = insights.topSpendingCategory;

  return (
    <section
      aria-label="Transaction insights"
      className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <article className={`${cardClass} overflow-hidden`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={labelClass}>Monthly activity · {monthLabel}</p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-foreground">
              {countFormatter.format(insights.monthlyTransactionCount)}
            </p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              {insights.monthlyTransactionCount === 1 ? "transaction" : "transactions"}
            </p>
          </div>
          <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-1 font-mono text-2xs font-bold tracking-wider text-accent uppercase">
            Live
          </span>
        </div>
        <div className="mt-4 border-t border-border/70 pt-3">
          <TransactionActivityChart activity={insights.dailyActivity} />
        </div>
      </article>

      <article className={cardClass}>
        <p className={labelClass}>Highest amount · {monthLabel}</p>
        {highestExpense === null ? (
          <EmptyMetric value="—" description="No posted expenses this month" />
        ) : (
          <>
            <p className="mt-4 truncate font-mono text-2xl font-bold tracking-tight text-expense">
              {privacyMode ? "₹ ••••••" : formatMinor(highestExpense.amountMinor)}
            </p>
            <p className="mt-3 truncate text-sm font-semibold text-foreground">
              {highestExpense.description}
            </p>
            <p className="mt-1 text-xs text-foreground-muted">Largest posted expense</p>
          </>
        )}
      </article>

      <article className={cardClass}>
        <p className={labelClass}>Highest spending category</p>
        {topCategory === null ? (
          <EmptyMetric value="—" description="No category spending this month" />
        ) : (
          <>
            <div className="mt-4 flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-sm"
                style={topCategory.color === undefined ? undefined : { color: topCategory.color }}
              >
                <IconGlyph value={topCategory.icon ?? "●"} size={16} />
              </span>
              <p className="truncate text-lg font-bold tracking-tight text-foreground">
                {topCategory.name}
              </p>
            </div>
            <p className="mt-3 font-mono text-xl font-bold text-foreground">
              {privacyMode ? "₹ ••••••" : formatMinor(topCategory.amountMinor)}
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              across {countFormatter.format(topCategory.transactionCount)}{" "}
              {topCategory.transactionCount === 1 ? "expense" : "expenses"}
            </p>
          </>
        )}
      </article>

      <article className={cardClass}>
        <p className={labelClass}>Lifetime transactions</p>
        <p className="mt-4 font-mono text-3xl font-bold tracking-tight text-foreground">
          {countFormatter.format(insights.lifetimeTransactionCount)}
        </p>
        <p className="mt-2 text-sm font-semibold text-foreground">Ledger entries recorded</p>
        <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
          Transfers count once; reversals remain part of the audit trail.
        </p>
      </article>
    </section>
  );
}

function EmptyMetric({
  value,
  description
}: Readonly<{ value: string; description: string }>): ReactNode {
  return (
    <>
      <p className="mt-4 font-mono text-3xl font-bold text-foreground-muted">{value}</p>
      <p className="mt-3 text-sm text-foreground-muted">{description}</p>
    </>
  );
}

function InsightsSkeleton(): ReactNode {
  return (
    <div
      aria-label="Loading transaction insights"
      className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className={cardClass}>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-8 w-24" />
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
