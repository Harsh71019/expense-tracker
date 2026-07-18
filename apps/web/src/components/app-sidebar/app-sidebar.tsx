"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { type Theme } from "@/lib/theme";

import { AppNav } from "../app-nav";
import { ThemeToggle } from "../ui/theme-toggle";

const SIDEBAR_COMPACT_KEY = "vyaya-sidebar-compact";

const navItems = [
  { href: "/transactions", label: "Transactions", icon: "≡" },
  { href: "/transfers", label: "Transfers", icon: "⤢" },
  { href: "/categories", label: "Categories", icon: "▤" },
  { href: "/category-rules", label: "Category rules", icon: "⌁" },
  { href: "/imports", label: "Imports", icon: "↥" },
  { href: "/reports", label: "Reports", icon: "◔" },
  { href: "/more", label: "More", icon: "•••" }
] as const;

function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}

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
      className={`hidden shrink-0 border-r border-border bg-surface-elevated p-4 transition-[width] duration-200 ease-out md:sticky md:top-0 md:flex md:h-screen md:flex-col md:justify-between ${compact ? "w-[84px]" : "w-64"}`}
    >
      <button
        type="button"
        onClick={toggleCompact}
        title={compact ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-[30px] -right-[13px] z-10 grid h-[26px] w-[26px] place-items-center rounded-full border border-border bg-surface-elevated text-foreground-muted shadow-sm transition-colors duration-150 hover:text-foreground"
      >
        <span
          className={`inline-block text-base leading-none transition-transform duration-200 ${compact ? "rotate-180" : "rotate-0"}`}
          aria-hidden="true"
        >
          ‹
        </span>
      </button>

      <div className="flex flex-col gap-7">
        <div className={`flex items-center gap-3 px-1 ${compact ? "justify-center" : ""}`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent font-mono text-lg font-bold text-accent-foreground shadow-glow">
            ₹
          </span>
          {compact ? null : (
            <div className="min-w-0">
              <p className="truncate text-base leading-none font-bold tracking-tight text-foreground">
                Vyaya
              </p>
              <p className="mt-1.5 font-mono text-[8px] font-bold tracking-[0.2em] text-accent uppercase">
                Expense tracker
              </p>
            </div>
          )}
        </div>
        <AppNav items={navItems} orientation="sidebar" compact={compact} />
      </div>

      <div className="flex flex-col gap-2">
        <ThemeToggle current={theme} compact={compact} />

        <Link
          href="/more"
          title={compact ? "Account" : undefined}
          aria-label={compact ? "Account" : undefined}
          className={`flex items-center gap-2.5 rounded-xl border border-border bg-surface px-2.5 py-2 transition-colors duration-150 hover:border-accent/40 ${compact ? "justify-center" : ""}`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-glow font-mono text-xs font-semibold text-accent">
            {initials(email)}
          </span>
          {compact ? null : (
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {email}
            </span>
          )}
        </Link>
      </div>
    </aside>
  );
}
