"use client";

import type { SpendingWarningAnalysis } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { formatShortDate, formatWarningTimestamp } from "../model/presentation";

/**
 * One compact status card (plan §4 "Analysis status") — a normal heading
 * and `section`, never a `role="alert"` banner on initial page load
 * (plan §2).
 */
export function AnalysisStatus({
  analysis,
  hasLoadError,
  onRetry
}: Readonly<{
  analysis: SpendingWarningAnalysis | undefined;
  hasLoadError: boolean;
  onRetry: () => void;
}>): ReactNode {
  if (hasLoadError && analysis === undefined) {
    return (
      <section
        aria-labelledby="spending-warnings-status-heading"
        className="rounded-xl border border-border bg-surface-muted p-4"
      >
        <h2 id="spending-warnings-status-heading" className="text-sm font-semibold text-foreground">
          Could not load spending patterns
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Check your connection and try the read again.
        </p>
        <Button type="button" variant="secondary" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      </section>
    );
  }

  if (analysis === undefined) {
    return null;
  }

  if (analysis.status === "learning" || analysis.status === "unavailable") {
    return (
      <section
        aria-labelledby="spending-warnings-status-heading"
        className="rounded-xl border border-border bg-surface-muted p-4"
      >
        <h2 id="spending-warnings-status-heading" className="text-sm font-semibold text-foreground">
          Learning your patterns
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">
          {analysis.status === "unavailable"
            ? "Nothing has been analyzed yet — check back after your next few posted expenses."
            : `Nothing is wrong here. We need more posted expenses before comparisons are reliable${
                analysis.baselineExpenseCount > 0
                  ? ` (${analysis.baselineExpenseCount} tracked so far)`
                  : ""
              }.`}
        </p>
      </section>
    );
  }

  if (analysis.status === "stale") {
    return (
      <section
        aria-labelledby="spending-warnings-status-heading"
        className="rounded-xl border border-border bg-surface-muted p-4"
      >
        <h2 id="spending-warnings-status-heading" className="text-sm font-semibold text-foreground">
          Analysis is delayed
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">
          {analysis.computedAt === undefined
            ? "Showing the most recent results available."
            : `Last checked ${formatWarningTimestamp(analysis.computedAt)}. Showing the most recent results.`}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="spending-warnings-status-heading"
      className="rounded-xl border border-border bg-surface-muted p-4"
    >
      <h2 id="spending-warnings-status-heading" className="text-sm font-semibold text-foreground">
        {analysis.sourceThrough === undefined
          ? "Compared through your latest posted expenses"
          : `Compared through ${formatShortDate(analysis.sourceThrough)}`}
      </h2>
      {analysis.computedAt === undefined ? null : (
        <p className="mt-1 text-sm text-foreground-muted">
          Last checked {formatWarningTimestamp(analysis.computedAt)}
        </p>
      )}
    </section>
  );
}
