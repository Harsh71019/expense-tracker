"use client";

import type { ReactNode } from "react";

export default function CashflowForecastError({
  reset
}: Readonly<{ error: Error; reset: () => void }>): ReactNode {
  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-6">
      <h1 className="text-xl font-bold text-foreground">Cash-flow forecast is unavailable</h1>
      <p className="mt-2 text-sm text-foreground-muted">
        The latest forecast evidence could not be loaded. No estimate is shown until it can be
        verified.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Try again
      </button>
    </section>
  );
}
