"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = Readonly<{ href: string; label: string; icon?: string }>;

export function AppNav({
  items,
  orientation,
  compact = false
}: Readonly<{
  items: readonly NavItem[];
  orientation: "sidebar" | "bottom";
  compact?: boolean;
}>): ReactNode {
  const pathname = usePathname();

  if (orientation === "sidebar") {
    return (
      <nav className="flex flex-col gap-1" aria-label="Main navigation">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={compact ? item.label : undefined}
              aria-label={compact ? item.label : undefined}
              className={`relative flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 ${compact ? "h-10 w-10 justify-center px-0" : "gap-3"} ${
                active
                  ? "bg-surface-muted border-l-[3px] border-accent font-semibold text-foreground"
                  : "text-foreground-muted border-l-[3px] border-transparent hover:bg-surface-muted/60 hover:text-foreground"
              }`}
            >
              {item.icon === undefined ? null : (
                <span
                  className={`w-5 text-center text-lg leading-none ${active ? "" : "opacity-80"}`}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              )}
              {compact ? <span className="sr-only">{item.label}</span> : item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex px-2 py-0.5" aria-label="Main navigation">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium tracking-wide transition-colors duration-150 ${
              active ? "text-accent font-semibold" : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {item.icon === undefined ? null : (
              <span className="text-lg leading-none" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span
              className={`h-1 w-1 rounded-full ${active ? "bg-accent" : "bg-transparent"}`}
              aria-hidden="true"
            />
            <span className="mt-0.5">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
