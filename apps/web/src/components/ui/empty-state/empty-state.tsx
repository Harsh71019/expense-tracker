import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon
}: Readonly<{
  title: string;
  description: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}>): ReactNode {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-muted/60 p-7 transition-all duration-200 hover:border-border/80">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-accent/60" aria-hidden="true" />
      {icon !== undefined ? (
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-accent/20 bg-accent-glow text-accent shadow-xs">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
      <div className="mt-1 text-sm text-foreground-muted">{description}</div>
      {action === undefined ? null : <div className="mt-5">{action}</div>}
    </div>
  );
}
