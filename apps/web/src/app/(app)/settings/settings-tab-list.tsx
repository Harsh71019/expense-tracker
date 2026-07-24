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
    <nav aria-label="Settings sections">
      <div
        role="tablist"
        aria-label="Settings sections"
        className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface-elevated p-1.5"
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
              className={`group flex min-w-0 items-center justify-center rounded-xl px-2 py-2.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:justify-start sm:gap-2.5 sm:px-3.5 sm:text-left ${
                active
                  ? "bg-accent text-accent-foreground shadow-glow"
                  : "text-foreground-muted hover:bg-accent-glow hover:text-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className={`hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-sm sm:grid ${
                  active
                    ? "bg-black/10 text-current"
                    : "bg-surface-muted text-accent group-hover:bg-surface"
                }`}
              >
                {tab.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold sm:text-sm">{tab.label}</span>
                <span
                  className={`mt-0.5 hidden truncate text-[10px] md:block ${
                    active ? "text-current opacity-75" : "text-foreground-muted"
                  }`}
                >
                  {tab.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
