"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { SignOutButton } from "@/features/auth";
import { type Theme } from "@/lib/theme";

import { AppNav } from "../app-nav";
import { ThemeToggle } from "../ui/theme-toggle";

const SIDEBAR_COMPACT_KEY = "vyaya-sidebar-compact";

const navItems = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/transactions", label: "Transactions", icon: "≡" },
  { href: "/add", label: "Add", icon: "+" },
  { href: "/reports", label: "Reports", icon: "◔" },
  { href: "/more", label: "More", icon: "•••" }
] as const;

export function AppSidebar({
  email,
  theme
}: Readonly<{ email: string; theme: Theme | null }>): ReactNode {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setCompact(window.localStorage.getItem(SIDEBAR_COMPACT_KEY) === "true");
  }, []);

  function toggleCompact(): void {
    setCompact((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COMPACT_KEY, String(next));
      return next;
    });
  }

  return (
    <aside
      className={`hidden shrink-0 border-r border-border bg-surface-elevated p-4 transition-[width] duration-200 ease-out md:flex md:flex-col md:justify-between ${compact ? "w-[88px]" : "w-64"}`}
    >
      <div className="flex flex-col gap-8">
        <div
          className={`flex ${compact ? "flex-col items-center gap-4" : "items-center justify-between px-2"}`}
        >
          <div className={compact ? "sr-only" : ""}>
            <span className="font-mono text-sm font-semibold tracking-[0.25em] text-foreground uppercase">
              Vyaya
            </span>
            <div className="mt-2.5 h-0.5 w-6 bg-accent rounded-full" aria-hidden="true" />
          </div>
          {compact ? (
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent font-mono text-base font-semibold text-accent-foreground"
              aria-hidden="true"
            >
              V
            </span>
          ) : null}
          <button
            type="button"
            onClick={toggleCompact}
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-sm text-foreground-muted transition-colors duration-150 hover:border-accent/50 hover:text-foreground"
          >
            {compact ? "→" : "←"}
          </button>
        </div>
        <AppNav items={navItems} orientation="sidebar" compact={compact} />
      </div>
      <div
        className={`rounded-xl border border-border bg-surface-muted p-3.5 ${compact ? "flex flex-col items-center gap-3" : ""}`}
      >
        <ThemeToggle current={theme} compact={compact} />
        {compact ? null : (
          <p className="mt-3 truncate font-mono text-[11px] tracking-wide text-foreground-muted">
            {email}
          </p>
        )}
        <div className={compact ? "" : "mt-3"}>
          <SignOutButton compact={compact} />
        </div>
      </div>
    </aside>
  );
}
