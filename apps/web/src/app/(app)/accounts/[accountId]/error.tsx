"use client";

import type { ReactNode } from "react";

export default function AccountDetailError({
  reset
}: Readonly<{ error: Error; reset: () => void }>): ReactNode {
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface-elevated p-6">
      <h1 className="text-xl font-bold text-foreground">Account details are unavailable</h1>
      <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
        The account statement could not be verified. Try loading it again; no ledger data was
        changed.
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
