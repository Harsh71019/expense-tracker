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
    tabs?.item(nextIndex)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Settings sections"
      className="flex gap-6 overflow-x-auto border-b border-border"
    >
      {SETTINGS_TABS.map((tab, index) => {
        const active = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            href={settingsTabHref(tab.id)}
            role="tab"
            aria-selected={active}
            aria-controls={`settings-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            scroll={false}
            onKeyDown={(event) => moveFocus(event, index)}
            className={`shrink-0 border-b-2 pb-3 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? "border-accent text-foreground"
                : "border-transparent text-foreground-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
