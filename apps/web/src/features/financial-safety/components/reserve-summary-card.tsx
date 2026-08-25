"use client";

import type { ReserveSummary } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";

import { useReserveSummary } from "../hooks/use-reserve-summary";

export interface ReserveSummaryCardProps {
  readonly initialData: ReserveSummary | null;
  readonly className?: string;
}

/**
 * A compact read of the canonical reserve aggregate. Every number here comes
 * straight from the backend response -- this component never sums source
 * rows itself.
 */
export function ReserveSummaryCard({
  initialData,
  className = ""
}: ReserveSummaryCardProps): ReactNode {
  const { data, error, refetch, isFetching } = useReserveSummary(initialData);

  const containerClassName = [
    "rounded-2xl border border-border/80 bg-surface p-5 shadow-sm transition-all",
    className
  ]
    .filter(Boolean)
    .join(" ");

  if (error && !data) {
    return (
      <div className={containerClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">Emergency reserves</h3>
            <p className="text-xs text-problem">Failed to load your reserve totals.</p>
          </div>
          <Button
            variant="secondary"
            className="text-xs"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const warningCount = data.missingValueSourceCount + data.staleSourceCount;

  return (
    <div className={containerClassName}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Emergency reserves</h3>
        <Badge variant={data.currentlyEligibleSourceCount > 0 ? "success" : "pending"}>
          {data.currentlyEligibleSourceCount > 0 ? "Ready" : "Not ready"}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryStat label="Instant access">
          <Money minor={data.instantMinor} size="md" />
        </SummaryStat>
        <SummaryStat label="T+1 access">
          <Money minor={data.tPlusOneMinor} size="md" />
        </SummaryStat>
        <SummaryStat label="Total eligible">
          <Money minor={data.totalEligibleMinor} size="md" variant="income" />
        </SummaryStat>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/50 pt-4 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-foreground-muted">Configured sources</dt>
          <dd className="mt-0.5 font-semibold text-foreground">{data.configuredSourceCount}</dd>
        </div>
        <div>
          <dt className="text-foreground-muted">Locked (excluded)</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            <Money minor={data.lockedMinor} size="sm" />
          </dd>
        </div>
        <div>
          <dt className="text-foreground-muted">Missing / stale warnings</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {warningCount > 0 ? (
              <span className="text-accent">{warningCount}</span>
            ) : (
              <span>0</span>
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-4 rounded-xl border border-border/60 bg-surface-muted/40 px-3 py-2 text-2xs text-foreground-muted">
        Classifying a source changes planning only. TreasuryOps does not move or lock your money.
      </p>
    </div>
  );
}

function SummaryStat({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>): ReactNode {
  return (
    <div>
      <span className="text-2xs font-semibold tracking-wider text-foreground-muted uppercase">
        {label}
      </span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
