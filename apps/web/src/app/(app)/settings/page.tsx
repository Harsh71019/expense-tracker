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
    <div className="flex w-full flex-col gap-6 animate-fade-in">
      {/* TreasuryOps Command Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/80 bg-surface-elevated/90 px-5 py-4.5 shadow-xs backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-glow/40 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-accent uppercase">
              <span
                className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
                aria-hidden="true"
              />
              TreasuryOps Engine
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-income/30 bg-income/10 px-2 py-0.5 font-mono text-[10px] font-bold text-income">
              ● Ledger Balanced
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Settings &amp; Workspace
          </h1>
          <p className="mt-1 text-xs text-foreground-muted">
            Personal financial operating system configuration, visual engineering, and double-entry
            invariants.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-foreground-muted">
          <span className="rounded-xl border border-border/70 bg-surface-muted/60 px-3 py-1.5 font-semibold text-foreground">
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
