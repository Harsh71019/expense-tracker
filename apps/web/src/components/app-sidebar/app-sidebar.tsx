"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { type Theme } from "@/lib/theme";

import { AppNav, useNavPreferences } from "../app-nav";
import { ThemeToggle } from "../ui/theme-toggle";
import { SidebarEditPanel } from "./sidebar-edit-panel";

const SIDEBAR_COMPACT_KEY = "treasury-ops-sidebar-compact";

function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}

export function AppSidebar({
  email,
  theme
}: Readonly<{ email: string; theme: Theme | null }>): ReactNode {
  const [compact, setCompact] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const { orderedVisibleItems, allOrderedItems, reorder, toggleVisible, reset } =
    useNavPreferences();

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

  function toggleEditMode(): void {
    if (!editMode && compact) {
      setCompact(false);
      window.localStorage.setItem(SIDEBAR_COMPACT_KEY, "false");
    }
    setEditMode((current) => !current);
  }

  return (
    <aside
      className={`hidden shrink-0 gap-4 overflow-hidden border-r border-border bg-surface-elevated p-4 transition-[width] duration-500 ease-out motion-reduce:transition-none md:sticky md:top-0 md:flex md:h-screen md:flex-col ${
        editMode ? "w-[420px] xl:w-[440px]" : compact ? "w-[84px]" : "w-64"
      }`}
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

      <div className="flex min-h-0 flex-1 flex-col gap-7">
        <div className={`flex items-center gap-3 px-1 ${compact ? "justify-center" : ""}`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent font-mono text-lg font-bold text-accent-foreground shadow-glow">
            ₹
          </span>
          {compact ? null : (
            <div className="min-w-0">
              <p className="truncate text-base leading-none font-bold tracking-tight text-foreground">
                TreasuryOps
              </p>
              <p className="mt-1.5 font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
                Expense tracker
              </p>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {editMode ? (
            <SidebarEditPanel
              items={allOrderedItems}
              compact={compact}
              onReorder={reorder}
              onToggle={toggleVisible}
              onReset={reset}
            />
          ) : (
            <AppNav items={orderedVisibleItems} orientation="sidebar" compact={compact} />
          )}
        </div>
      </div>

      <div className="shrink-0 pt-1 flex flex-col gap-2">
        <div className={`flex gap-2 ${compact ? "flex-col" : ""}`}>
          <ThemeToggle current={theme} compact={compact} />
          <button
            type="button"
            id="sidebar-edit-toggle"
            onClick={toggleEditMode}
            aria-label={editMode ? "Done editing sidebar" : "Edit sidebar"}
            aria-pressed={editMode}
            title={compact ? (editMode ? "Done" : "Edit sidebar") : undefined}
            className={`flex items-center justify-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition-colors duration-150 ${
              editMode
                ? "border-accent bg-accent-glow text-accent"
                : "border-border text-foreground-muted hover:border-accent/40 hover:text-foreground"
            } ${compact ? "h-10 w-10" : "flex-1"}`}
          >
            <span aria-hidden="true">{editMode ? "✓" : "✎"}</span>
            {!compact && <span>{editMode ? "Done" : "Edit"}</span>}
          </button>
        </div>

        <Link
          href="/settings"
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
