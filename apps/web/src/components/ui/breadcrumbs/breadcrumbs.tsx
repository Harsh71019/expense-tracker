import Link from "next/link";
import type { ReactNode } from "react";

export type BreadcrumbItem = Readonly<{
  label: string;
  href?: string;
}>;

export function Breadcrumbs({ items }: Readonly<{ items: readonly BreadcrumbItem[] }>): ReactNode {
  const mobileBackTarget = items.length > 1 ? items[0] : undefined;

  return (
    <nav aria-label="Breadcrumb">
      {mobileBackTarget?.href === undefined ? null : (
        <Link
          href={mobileBackTarget.href}
          className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 text-sm font-semibold text-foreground-muted transition-colors hover:bg-surface-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:hidden"
        >
          <span aria-hidden="true">←</span>
          <span className="truncate">Back to {mobileBackTarget.label}</span>
        </Link>
      )}
      <ol className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground-muted sm:flex">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {index === 0 ? null : (
                <span className="font-mono text-xs text-border" aria-hidden="true">
                  /
                </span>
              )}
              {isCurrent || item.href === undefined ? (
                <span
                  className="truncate font-semibold text-foreground"
                  {...(isCurrent ? { "aria-current": "page" as const } : {})}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-sm transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
