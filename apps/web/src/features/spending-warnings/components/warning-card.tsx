"use client";

import type { SpendingWarning } from "@treasury-ops/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";

import { useDismissSpendingWarning } from "../hooks/use-dismiss-spending-warning";
import {
  evidenceFacts,
  evidenceSummary,
  formatWarningTimestamp,
  formatWindowRange,
  investigationHref,
  investigationLinkLabel,
  percentAboveBaseline,
  severityLabel,
  warningKindIcon,
  warningKindLabel,
  warningTitle
} from "../model/presentation";

const DISMISS_SUCCESS_MESSAGE =
  "Marked not useful for this period. A later pattern may still appear.";

export function WarningCard({
  warning,
  onDismissed
}: Readonly<{
  warning: SpendingWarning;
  onDismissed: (warningId: string, message: string) => void;
}>): ReactNode {
  const dismiss = useDismissSpendingWarning();
  const headingId = `spending-warning-${warning.id}-title`;
  const evidence = warning.evidence;

  function handleDismiss(): void {
    dismiss.mutate(warning.id, {
      onSuccess: () => onDismissed(warning.id, DISMISS_SUCCESS_MESSAGE)
    });
  }

  const sampleSize =
    evidence.kind === "overall_spend_spike" || evidence.kind === "category_spend_spike"
      ? `N=${evidence.baselineExpenseCount} baseline expenses · ${evidence.baselineWindowCount} windows`
      : `N=${evidence.baselineExpenseCount} baseline sample transactions`;

  return (
    <article
      aria-labelledby={headingId}
      className="glass-card group relative flex flex-col justify-between rounded-2xl p-5 shadow-xs transition-all duration-200 hover:border-accent/40 hover:shadow-md sm:p-6"
    >
      <div>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/80 bg-surface-muted/80 text-lg text-foreground shadow-2xs"
            >
              {warningKindIcon(warning.kind)}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                  {warningKindLabel(warning.kind)}
                </p>
                {evidence.kind === "overall_spend_spike" ||
                evidence.kind === "category_spend_spike" ? (
                  <span className="inline-flex items-center rounded-md border border-expense/30 bg-expense/10 px-2 py-0.5 font-mono text-2xs font-bold text-expense">
                    +{percentAboveBaseline(evidence.ratioBasisPoints)}% vs median
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-2xs font-bold text-amber-600 dark:text-amber-400">
                    IQR Outlier
                  </span>
                )}
              </div>
              <h3
                id={headingId}
                className="mt-1 text-base font-bold tracking-tight text-foreground sm:text-lg"
              >
                {warningTitle(warning)}
              </h3>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2.5 py-0.5 font-mono text-2xs font-bold uppercase ${
              warning.severity === "high"
                ? "border-expense/30 bg-expense/10 text-expense"
                : "border-border/80 bg-surface-muted/60 text-foreground-muted"
            }`}
          >
            {severityLabel(warning.severity)}
          </span>
        </header>

        <p className="mt-3 text-xs leading-relaxed text-foreground-muted sm:text-sm">
          {evidenceSummary(warning)}
        </p>

        {/* Statistical Facts Grid */}
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-xl border border-border/70 bg-surface-muted/45 p-3.5 text-xs sm:grid-cols-2">
          {evidenceFacts(warning).map((fact) => (
            <div
              key={fact.label}
              className="flex items-center justify-between gap-3 sm:justify-start"
            >
              <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                {fact.label}
              </dt>
              <dd className="font-semibold text-foreground">
                {fact.kind === "text" ? (
                  <span className="font-mono text-expense">{fact.value}</span>
                ) : fact.kind === "money" ? (
                  <Money minor={fact.minor} size="sm" />
                ) : (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Money minor={fact.fromMinor} size="sm" />
                    <span aria-hidden="true">–</span>
                    <Money minor={fact.toMinor} size="sm" />
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {/* Forensic Sample Size & Window Range */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-2xs text-foreground-muted">
          <span>{formatWindowRange(warning.windowStart, warning.windowEnd)}</span>
          <span className="rounded bg-surface-muted/80 px-1.5 py-0.5 border border-border/60">
            {sampleSize}
          </span>
          <span>last detected {formatWarningTimestamp(warning.lastDetectedAt)}</span>
        </div>
      </div>

      <footer className="mt-4.5 flex flex-col items-stretch gap-2 border-t border-border/60 pt-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <Link
          href={investigationHref(warning)}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-accent/30 bg-accent-glow/40 px-3.5 py-2 text-xs font-bold text-accent transition-all hover:bg-accent-glow hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:justify-start"
        >
          <span>{investigationLinkLabel(warning.kind)}</span>
          <span aria-hidden="true">→</span>
        </Link>
        <Button
          type="button"
          variant="secondary"
          className="min-h-10 w-full sm:w-auto"
          disabled={dismiss.isPending}
          onClick={handleDismiss}
        >
          {dismiss.isPending ? "Dismissing…" : "Not useful for this period"}
        </Button>
      </footer>

      {dismiss.isError ? (
        <p className="mt-3 rounded-xl border border-expense/25 bg-expense/10 px-3.5 py-2 font-mono text-2xs text-expense">
          {dismiss.error.message || "Could not dismiss this warning."}{" "}
          <button type="button" className="min-h-9 font-semibold underline" onClick={handleDismiss}>
            Try again
          </button>
        </p>
      ) : null}
    </article>
  );
}
