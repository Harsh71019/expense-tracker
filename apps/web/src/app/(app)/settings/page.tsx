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
    <div className="flex w-full flex-col gap-8">
      {/* Settings Page Header */}
      <header className="relative overflow-hidden rounded-3xl border border-border/80 bg-surface-elevated/90 p-6 shadow-sm backdrop-blur-md sm:p-8">
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-accent-glow/20 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-glow/40 px-3 py-1 font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
                  aria-hidden="true"
                />
                TreasuryOps · Settings
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Settings & Workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
              Manage your personal identity, customize your browser workspace appearance, and
              orchestrate double-entry ledger tools in one central control hub.
            </p>
          </div>

          <div className="hidden font-mono text-[11px] text-foreground-muted sm:block text-right">
            <span className="inline-block rounded-lg border border-border/70 bg-surface-muted/60 px-2.5 py-1">
              Ledger Engine v1.0
            </span>
          </div>
        </div>
      </header>

      {/* Main Settings Grid */}
      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        <aside className="lg:sticky lg:top-20">
          <SettingsTabList activeTab={activeTab} />
          <div className="mt-4 hidden rounded-xl border border-border/60 bg-surface-muted/40 p-3.5 text-xs leading-relaxed text-foreground-muted lg:block">
            <p className="font-semibold text-foreground/80">💡 Storage Note</p>
            <p className="mt-1">
              Appearance preferences are preserved per-browser. Profile and ledger updates sync
              instantly across your TreasuryOps account.
            </p>
          </div>
        </aside>

        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          tabIndex={0}
          className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-surface"
        >
          {await SettingsPanel({ activeTab })}
        </div>
      </div>
    </div>
  );
}
