import type { ReactNode } from "react";

const titleClasses = {
  default: "text-2xl sm:text-3xl",
  compact: "text-xl sm:text-2xl"
} as const;

export type PageHeaderSize = keyof typeof titleClasses;

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  size = "default"
}: Readonly<{
  eyebrow: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  size?: PageHeaderSize;
}>): ReactNode {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
          <span aria-hidden="true" className="h-px w-5 shrink-0 bg-accent" />
          {eyebrow}
        </p>
        <h1 className={`mt-1 font-bold tracking-tight text-foreground ${titleClasses[size]}`}>
          {title}
        </h1>
        {description === undefined ? null : (
          <div className="mt-1 max-w-xl text-xs text-foreground-muted">{description}</div>
        )}
      </div>
      {action === undefined ? null : <div className="w-full shrink-0 sm:w-auto">{action}</div>}
    </header>
  );
}
