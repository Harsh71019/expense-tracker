"use client";

import { Briefcase, LayoutGrid, Palette, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";

import { SETTINGS_TABS, settingsTabHref } from "./settings-tabs";
import type { SettingsTab } from "./settings-tabs";

const tabIcons: Record<
  string,
  ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>
> = {
  User,
  Palette,
  LayoutGrid,
  Briefcase,
  ShieldCheck
};

function destinationIndex(key: string, currentIndex: number): number | null {
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return SETTINGS_TABS.length - 1;
  }
  if (key === "ArrowRight") {
    return (currentIndex + 1) % SETTINGS_TABS.length;
  }
  if (key === "ArrowLeft") {
    return (currentIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
  }
  return null;
}

export function SettingsTabList({ activeTab }: Readonly<{ activeTab: SettingsTab }>): ReactNode {
  function moveFocus(event: KeyboardEvent<HTMLAnchorElement>, currentIndex: number): void {
    const nextIndex = destinationIndex(event.key, currentIndex);
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLAnchorElement>('[role="tab"]');
    tabs?.item(nextIndex)?.focus();
  }

  return (
    <nav
      aria-label="Settings sections"
      className="glass-card rounded-2xl p-1.5 shadow-xs backdrop-blur-md"
    >
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1.5 overflow-x-auto custom-scrollbar"
      >
        {SETTINGS_TABS.map((tab, index) => {
          const active = tab.id === activeTab;
          const Icon = tabIcons[tab.iconName] ?? User;

          return (
            <Link
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              href={settingsTabHref(tab.id)}
              role="tab"
              aria-label={tab.label}
              aria-selected={active}
              aria-controls={`settings-panel-${tab.id}`}
              aria-current={active ? "page" : undefined}
              tabIndex={active ? 0 : -1}
              scroll={false}
              onKeyDown={(event) => moveFocus(event, index)}
              className={`group relative flex min-h-11 min-w-[7.5rem] flex-1 items-center justify-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:justify-start ${
                active
                  ? "border-accent/40 bg-accent-glow/50 text-accent font-semibold shadow-xs"
                  : "border-transparent text-foreground-muted hover:border-border/80 hover:bg-surface-muted/60 hover:text-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-all duration-200 ${
                  active
                    ? "bg-surface-elevated text-accent shadow-xs scale-105 ring-1 ring-accent/20"
                    : "bg-surface-muted/80 text-foreground-muted group-hover:bg-surface-elevated group-hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden={true} />
              </span>
              <span className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-1.5">
                <span className="block truncate text-xs font-bold sm:text-sm tracking-tight">
                  {tab.label}
                </span>
                <span
                  className={`hidden truncate text-2xs xl:inline-block ${
                    active ? "text-accent/80 font-medium" : "text-foreground-muted"
                  }`}
                >
                  · {tab.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
