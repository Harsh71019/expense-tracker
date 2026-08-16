import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";

import { AppearanceSection } from "./sections/appearance-section";
import { DeveloperAccessSection } from "./sections/developer-access-section";
import { IncomeSection } from "./sections/income-section";
import { ProfileSection } from "./sections/profile-section";
import { SettingsTabList } from "./settings-tab-list";
import { settingsTabFromParam } from "./settings-tabs";
import type { SettingsTab } from "./settings-tabs";

interface SettingsSearchParams {
  tab?: string | string[];
}

async function renderTab(tab: SettingsTab): Promise<ReactNode> {
  if (tab === "appearance") {
    return AppearanceSection();
  }
  if (tab === "income") {
    return IncomeSection();
  }
  if (tab === "api-keys") {
    return DeveloperAccessSection();
  }
  return ProfileSection();
}

export default async function SettingsPage({
  searchParams
}: Readonly<{ searchParams: Promise<SettingsSearchParams> }>): Promise<ReactNode> {
  const activeTab = settingsTabFromParam((await searchParams).tab);

  return (
    <PageShell width="standard" className="animate-fade-in">
      <PageHeader
        eyebrow="Account / settings"
        title="Settings"
        description="Your profile, appearance, income, and API access."
      />

      <SettingsTabList activeTab={activeTab} />

      <div
        id={`settings-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${activeTab}`}
        tabIndex={0}
        className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {await renderTab(activeTab)}
      </div>
    </PageShell>
  );
}
