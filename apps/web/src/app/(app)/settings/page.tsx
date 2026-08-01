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
    <div className="flex w-full flex-col gap-7">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
          TreasuryOps · Settings
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
          Your profile, workspace preferences, and ledger tools—organized in one place.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
        <aside className="lg:sticky lg:top-20">
          <SettingsTabList activeTab={activeTab} />
          <p className="mt-4 hidden px-3 text-xs leading-relaxed text-foreground-muted lg:block">
            Appearance choices are stored in this browser. Ledger tools apply to your TreasuryOps
            account.
          </p>
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
