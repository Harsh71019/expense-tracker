import type { ReactNode } from "react";

export function ComingSoon({
  title,
  phase
}: Readonly<{ title: string; phase: string }>): ReactNode {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center">
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface-muted px-8 py-10 text-center">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-border" aria-hidden="true" />
        <p className="font-mono text-xs tracking-widest text-foreground-muted uppercase">{phase}</p>
        <h1 className="mt-2 text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-foreground-muted">Not posted to the ledger yet.</p>
      </div>
    </div>
  );
}
