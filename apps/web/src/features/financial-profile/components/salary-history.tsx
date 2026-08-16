"use client";

import { formatMinor, type SalaryVersion } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

import { formatEffectiveDate } from "./salary-statistics-panel";

type SalaryHistoryProps = Readonly<{
  versions: readonly SalaryVersion[];
  currentVersionId: string | null;
  asOf: Date;
  isLoading?: boolean;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  onAddSalaryChange: () => void;
}>;

/**
 * Read-only, newest first. History is append-only on the server, so there is
 * deliberately no inline edit affordance here — a correction is a new version
 * added through "Add salary change".
 */
export function SalaryHistory({
  versions,
  currentVersionId,
  asOf,
  isLoading = false,
  hasMore = false,
  isFetchingMore = false,
  onLoadMore,
  onAddSalaryChange
}: SalaryHistoryProps): ReactNode {
  if (isLoading) {
    return (
      <section aria-label="Salary history" aria-busy="true" className="space-y-2">
        <span className="sr-only">Loading salary history…</span>
        {[0, 1].map((index) => (
          <Skeleton key={index} className="h-20 rounded-2xl" />
        ))}
      </section>
    );
  }

  if (versions.length === 0) {
    return (
      <section aria-label="Salary history">
        <EmptyState
          title="No salary history yet"
          description="Once you save a net monthly salary it appears here, newest first. Earlier versions are kept forever so past months stay interpretable."
          action={
            <Button type="button" onClick={onAddSalaryChange}>
              Add salary change
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section aria-label="Salary history" className="space-y-3">
      <ol className="space-y-2">
        {versions.map((version) => {
          const future = version.effectiveFrom.getTime() > asOf.getTime();
          const current = version.id === currentVersionId;
          return (
            <li
              key={version.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-surface-muted/40 px-4 py-3.5"
            >
              <div className="min-w-0">
                <p className="font-mono text-base font-bold tabular-nums text-foreground">
                  {formatMinor(version.netMonthlySalaryMinor)}
                  <span className="ml-1.5 font-sans text-xs font-medium text-foreground-muted">
                    net in-hand / month
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-foreground-muted">
                  Effective from {formatEffectiveDate(version.effectiveFrom)}
                </p>
                {version.annualCtcMinor === null ? null : (
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    Annual CTC {formatMinor(version.annualCtcMinor)} — recorded for reference, not
                    spendable income.
                  </p>
                )}
              </div>
              {/* Status is spelled out in text, never signalled by colour alone. */}
              <span
                className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-2xs font-bold uppercase ${
                  future
                    ? "border-accent/40 bg-accent-glow/40 text-accent"
                    : current
                      ? "border-income/40 bg-income/10 text-income"
                      : "border-border bg-surface-muted text-foreground-muted"
                }`}
              >
                {future ? "Takes effect later" : current ? "Current" : "Superseded"}
              </span>
            </li>
          );
        })}
      </ol>

      {hasMore && onLoadMore !== undefined ? (
        <Button type="button" variant="secondary" onClick={onLoadMore} disabled={isFetchingMore}>
          {isFetchingMore ? "Loading…" : "Show earlier versions"}
        </Button>
      ) : null}
    </section>
  );
}
