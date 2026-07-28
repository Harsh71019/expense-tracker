import Link from "next/link";
import type { ReactNode } from "react";

export type BreadcrumbItem = Readonly<{
  label: string;
  href?: string;
}>;

export function Breadcrumbs({ items }: Readonly<{ items: readonly BreadcrumbItem[] }>): ReactNode {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground-muted">
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
                  className="rounded-sm transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
