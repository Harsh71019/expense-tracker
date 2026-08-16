import type { ReactNode } from "react";

import { SettingsPanel } from "./settings-panel";
import { SettingsTabList } from "./settings-tab-list";
import { settingsTabFromParam } from "./settings-tabs";

interface SettingsSearchParams {
  tab?: string | string[];
}

export default async function SettingsPage({
  searchParams
}: Readonly<{ searchParams: Promise<SettingsSearchParams> }>): Promise<ReactNode> {
  const activeTab = settingsTabFromParam((await searchParams).tab);

  return (
    <div className="flex w-full flex-col gap-4.5 animate-fade-in">
      {/* Settings Header */}
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Settings &amp; Workspace
          </h1>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Workspace configuration, visual themes, and system preferences.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-foreground-muted">
          <span className="rounded-lg border border-border/70 bg-surface-muted/60 px-2.5 py-1 text-2xs font-semibold text-foreground">
            Asia/Kolkata (IST)
          </span>
        </div>
      </header>

      {/* Modern Tab Bar */}
      <SettingsTabList activeTab={activeTab} />

      {/* Main Settings Panel */}
      <div
        id={`settings-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        tabIndex={0}
        className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {await SettingsPanel({ activeTab })}
      </div>
    </div>
  );
}
