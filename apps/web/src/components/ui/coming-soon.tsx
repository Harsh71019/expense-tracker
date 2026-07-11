import type { ReactNode } from "react";

export function ComingSoon({
  title,
  phase
}: Readonly<{ title: string; phase: string }>): ReactNode {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-foreground-muted">Coming in {phase}.</p>
    </div>
  );
}
