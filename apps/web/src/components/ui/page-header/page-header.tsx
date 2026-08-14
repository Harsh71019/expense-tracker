import type { ReactNode } from "react";

const titleClasses = {
  default: "text-3xl sm:text-4xl",
  compact: "text-2xl sm:text-3xl"
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
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
          <span aria-hidden="true" className="h-px w-7 shrink-0 bg-accent" />
          {eyebrow}
        </p>
        <h1 className={`mt-2 font-bold tracking-tight text-foreground ${titleClasses[size]}`}>
          {title}
        </h1>
        {description === undefined ? null : (
          <div className="mt-2 max-w-xl text-sm leading-relaxed text-foreground-muted">
            {description}
          </div>
        )}
      </div>
      {action === undefined ? null : <div className="w-full shrink-0 sm:w-auto">{action}</div>}
    </header>
  );
}
