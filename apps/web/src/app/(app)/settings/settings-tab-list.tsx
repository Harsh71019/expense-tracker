"use client";

import Link from "next/link";
import type { KeyboardEvent, ReactNode } from "react";

import { SETTINGS_TABS, settingsTabHref } from "./settings-tabs";
import type { SettingsTab } from "./settings-tabs";

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
    tabs?.item(nextIndex).focus();
  }

  return (
    <nav
      aria-label="Settings sections"
      className="glass-card rounded-2xl p-2 shadow-sm backdrop-blur-md"
    >
      <div className="hidden items-center justify-between px-3 pt-1.5 pb-2.5 lg:flex">
        <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-foreground-muted uppercase">
          Settings Menu
        </p>
        <span className="h-1.5 w-1.5 rounded-full bg-accent/60" aria-hidden="true" />
      </div>
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1.5 overflow-x-auto custom-scrollbar lg:flex-col lg:overflow-visible"
      >
        {SETTINGS_TABS.map((tab, index) => {
          const active = tab.id === activeTab;
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
              className={`group relative flex min-h-12 min-w-[7rem] flex-1 items-center justify-center gap-3 rounded-xl border px-3 py-2.5 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:min-w-0 lg:justify-start lg:px-3.5 lg:text-left ${
                active
                  ? "border-accent/40 bg-accent-glow/50 text-accent shadow-glow font-semibold"
                  : "border-transparent text-foreground-muted hover:border-border/80 hover:bg-surface-muted/60 hover:text-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className={`hidden h-9 w-9 shrink-0 place-items-center rounded-xl text-base font-bold transition-all duration-200 sm:grid ${
                  active
                    ? "bg-surface-elevated text-accent shadow-sm scale-105"
                    : "bg-surface-muted/80 text-foreground-muted group-hover:bg-surface-elevated group-hover:text-foreground"
                }`}
              >
                {tab.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold sm:text-sm tracking-tight">
                  {tab.label}
                </span>
                <span
                  className={`mt-0.5 hidden truncate text-[11px] lg:block ${
                    active ? "text-accent/90 font-medium" : "text-foreground-muted"
                  }`}
                >
                  {tab.description}
                </span>
              </span>
              {active ? (
                <span
                  className="hidden h-2 w-2 rounded-full bg-accent lg:block shadow-glow"
                  aria-hidden="true"
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
