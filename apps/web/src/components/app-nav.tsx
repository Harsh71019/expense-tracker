"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = Readonly<{ href: string; label: string }>;

export function AppNav({
  items,
  orientation
}: Readonly<{ items: readonly NavItem[]; orientation: "sidebar" | "bottom" }>): ReactNode {
  const pathname = usePathname();

  if (orientation === "sidebar") {
    return (
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-surface-muted text-foreground"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {active ? (
                <span className="absolute inset-y-1 left-0 w-0.5 bg-accent" aria-hidden="true" />
              ) : null}
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex border-t border-border bg-surface">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium tracking-wide transition-colors ${
              active ? "text-accent" : "text-foreground-muted"
            }`}
          >
            <span
              className={`h-0.5 w-6 rounded-full transition-colors ${active ? "bg-accent" : "bg-transparent"}`}
              aria-hidden="true"
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
