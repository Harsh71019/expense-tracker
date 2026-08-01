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

  function handleDismiss(): void {
    dismiss.mutate(warning.id, {
      onSuccess: () => onDismissed(warning.id, DISMISS_SUCCESS_MESSAGE)
    });
  }

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-xl border border-border bg-surface-elevated p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span aria-hidden="true" className="mt-0.5 text-lg text-foreground-muted">
            {warningKindIcon(warning.kind)}
          </span>
          <div>
            <p className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
              {warningKindLabel(warning.kind)}
            </p>
            <h3 id={headingId} className="mt-0.5 text-base font-semibold text-foreground">
              {warningTitle(warning)}
            </h3>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            warning.severity === "high"
              ? "border-expense/30 bg-expense/10 text-expense"
              : "border-border bg-surface-muted text-foreground-muted"
          }`}
        >
          {severityLabel(warning.severity)}
        </span>
      </header>

      <p className="mt-3 text-sm text-foreground-muted">{evidenceSummary(warning)}</p>

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 border-t border-border pt-4 text-xs sm:grid-cols-2">
        {evidenceFacts(warning).map((fact) => (
          <div
            key={fact.label}
            className="flex items-center justify-between gap-3 sm:justify-start"
          >
            <dt className="font-mono tracking-wide text-foreground-muted uppercase">
              {fact.label}
            </dt>
            <dd className="font-semibold text-foreground">
              {fact.kind === "text" ? (
                fact.value
              ) : fact.kind === "money" ? (
                <Money minor={fact.minor} size="sm" />
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Money minor={fact.fromMinor} size="sm" />
                  <span aria-hidden="true">–</span>
                  <Money minor={fact.toMinor} size="sm" />
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 font-mono text-[11px] text-foreground-muted">
        {formatWindowRange(warning.windowStart, warning.windowEnd)} · last detected{" "}
        {formatWarningTimestamp(warning.lastDetectedAt)}
      </p>

      <footer className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Link
          href={investigationHref(warning)}
          className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:justify-start"
        >
          {investigationLinkLabel(warning.kind)}
        </Link>
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          disabled={dismiss.isPending}
          onClick={handleDismiss}
        >
          {dismiss.isPending ? "Dismissing…" : "Not useful for this period"}
        </Button>
      </footer>

      {dismiss.isError ? (
        <p className="mt-3 rounded-lg border border-expense/25 bg-expense/10 px-3 py-2 font-mono text-[11px] text-expense">
          {dismiss.error.message || "Could not dismiss this warning."}{" "}
          <button
            type="button"
            className="min-h-11 font-semibold underline"
            onClick={handleDismiss}
          >
            Try again
          </button>
        </p>
      ) : null}
    </article>
  );
}
