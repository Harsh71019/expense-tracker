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
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-5">
      <header className="mb-1">
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
          TreasuryOps · Settings
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
          Manage your profile, personalize the interface, and open administrative tools.
        </p>
      </header>

      <SettingsTabList activeTab={activeTab} />

      <div
        id={`settings-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-surface"
      >
        {await SettingsPanel({ activeTab })}
      </div>
    </div>
  );
}
