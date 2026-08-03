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
    <div className="flex w-full flex-col gap-5">
      {/* Sleek Compact Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface-elevated/90 px-5 py-4 shadow-xs backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-glow/40 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-accent uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" aria-hidden="true" />
            TreasuryOps
          </span>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Settings &amp; Workspace
          </h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-foreground-muted">
          <span className="rounded-lg border border-border/70 bg-surface-muted/60 px-2.5 py-1 font-semibold">
            Engine v1.0 · IST
          </span>
        </div>
      </header>

      {/* Horizontal Tabs */}
      <SettingsTabList activeTab={activeTab} />

      {/* Main Settings Panel - Full Width */}
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
