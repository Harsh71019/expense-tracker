import { formatMinor, type SalaryStatistics } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, StatCardLabel, StatCardValue } from "@/components/ui/stat-card";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric"
});

const DATA_QUALITY_COPY = {
  complete: { label: "Complete", detail: "Every input needed for these figures is present." },
  limited: { label: "Limited", detail: "These figures rest on an assumption worth reading." },
  stale: { label: "Stale", detail: "The salary behind these figures may be out of date." },
  unavailable: { label: "Unavailable", detail: "These figures could not be derived." }
} as const;

export function formatEffectiveDate(value: Date): string {
  return DATE_FORMAT.format(value);
}

type SalaryStatisticsPanelProps = Readonly<{
  statistics: SalaryStatistics | null;
  isLoading?: boolean;
  isStale?: boolean;
  error?: Error | null;
}>;

/**
 * Read-only presentation of server-computed figures. Nothing here divides,
 * annualizes, or otherwise recomputes a salary — the API is the authority.
 */
export function SalaryStatisticsPanel({
  statistics,
  isLoading = false,
  isStale = false,
  error = null
}: SalaryStatisticsPanelProps): ReactNode {
  if (isLoading) {
    return (
      <section
        aria-label="Salary statistics"
        aria-busy="true"
        className="grid gap-3 sm:grid-cols-2"
      >
        <span className="sr-only">Loading salary statistics…</span>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-2xl" />
        ))}
      </section>
    );
  }

  if (error !== null) {
    return (
      <section
        aria-label="Salary statistics"
        className="rounded-2xl border border-expense/30 bg-expense/5 p-5"
      >
        <p className="text-sm font-semibold text-foreground">Salary statistics unavailable</p>
        <p className="mt-1 text-sm text-foreground-muted">
          {error.message} Your saved salary is unchanged.
        </p>
      </section>
    );
  }

  if (statistics === null) {
    return null;
  }

  const quality = DATA_QUALITY_COPY[statistics.dataQuality];

  return (
    <section aria-label="Salary statistics" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard as="article" aria-label="Current net monthly salary" padding="xs">
          <StatCardLabel>Net monthly in-hand</StatCardLabel>
          <StatCardValue>{formatMinor(statistics.currentNetMonthlySalaryMinor)}</StatCardValue>
          <p className="mt-1.5 text-xs text-foreground-muted">
            Effective from {formatEffectiveDate(statistics.effectiveFrom)}
          </p>
        </StatCard>

        <StatCard as="article" aria-label="Annualized net income" padding="xs">
          <StatCardLabel>Annualized net income</StatCardLabel>
          <StatCardValue>{formatMinor(statistics.annualizedNetIncomeMinor)}</StatCardValue>
          <p className="mt-1.5 text-xs text-foreground-muted">
            Net in-hand salary × {statistics.assumptions.monthsPerYear} months. Annual CTC is not
            included.
          </p>
        </StatCard>

        <StatCard as="article" aria-label="Net hourly wage" padding="xs">
          <StatCardLabel>Net hourly wage</StatCardLabel>
          <StatCardValue>{formatMinor(statistics.netHourlyWageMinor)}</StatCardValue>
          <p className="mt-1.5 text-xs text-foreground-muted">
            Based on {statistics.monthlyWorkMinutes / statistics.assumptions.minutesPerHour} working
            hours a month.
          </p>
        </StatCard>

        <StatCard as="article" aria-label="Eight-hour workday equivalent" padding="xs">
          <StatCardLabel>Eight-hour workday</StatCardLabel>
          <StatCardValue>{formatMinor(statistics.eightHourWorkdayEquivalentMinor)}</StatCardValue>
          <p className="mt-1.5 text-xs text-foreground-muted">
            What {statistics.assumptions.standardWorkdayMinutes / 60} hours of work is worth.
          </p>
        </StatCard>
      </div>

      <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-surface-muted/50 px-4 py-3 text-xs">
        <div className="flex items-center gap-1.5">
          <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Data source
          </dt>
          <dd className="font-semibold text-foreground">Manually confirmed</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Data quality
          </dt>
          {/* Label first, colour second: the state is never carried by colour alone. */}
          <dd className="font-semibold text-foreground" title={quality.detail}>
            {quality.label}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            Formula
          </dt>
          <dd className="font-mono font-semibold text-foreground">v{statistics.formulaVersion}</dd>
        </div>
        {isStale ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Refresh state</dt>
            <dd className="font-semibold text-foreground-muted">Refreshing…</dd>
          </div>
        ) : null}
      </dl>

      {statistics.limitations.length === 0 ? null : (
        <div className="rounded-2xl border border-border bg-surface-muted/40 p-4">
          <h3 className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            What these figures assume
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-foreground-muted">
            {statistics.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
