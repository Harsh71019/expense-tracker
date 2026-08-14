import type { ReactNode } from "react";

export function SectionHeader({
  title,
  description,
  action
}: Readonly<{
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}>): ReactNode {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
        {description === undefined ? null : (
          <div className="mt-1 max-w-xl text-sm text-foreground-muted">{description}</div>
        )}
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </header>
  );
}
