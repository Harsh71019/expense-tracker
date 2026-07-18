import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action
}: Readonly<{ title: string; description: ReactNode; action?: ReactNode }>): ReactNode {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface-muted py-8 pr-6 pl-7">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-border" aria-hidden="true" />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-1 text-sm text-foreground-muted">{description}</div>
      {action === undefined ? null : <div className="mt-4">{action}</div>}
    </div>
  );
}
