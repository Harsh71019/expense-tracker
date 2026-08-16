import { Clock, KeyRound } from "lucide-react";
import Link from "next/link";
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
    <div className="flex w-full flex-col gap-5 animate-fade-in">
      {/* Settings Master Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
            Settings &amp; Workspace
          </h1>
          <p className="mt-1 text-xs text-foreground-muted">
            Personalize your operator environment, manage double-entry subsystems, and verify ledger
            invariants.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-2xs">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-surface-elevated px-3 py-1.5 font-semibold text-foreground shadow-2xs">
            <Clock className="h-3 w-3 text-accent" aria-hidden={true} />
            <span>Asia/Kolkata (IST · UTC+5:30)</span>
          </span>
          <Link
            href="/settings/api-keys"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-surface-muted/60 px-3 py-1.5 font-bold text-foreground transition-colors hover:border-accent/40 hover:text-accent"
          >
            <KeyRound className="h-3 w-3" aria-hidden={true} />
            <span>API Keys</span>
          </Link>
        </div>
      </header>

      {/* Navigation Tab Bar */}
      <SettingsTabList activeTab={activeTab} />

      {/* Main Settings Panel Container */}
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
