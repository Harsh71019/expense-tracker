import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";

import { AppearanceSection } from "./sections/appearance-section";
import { DeveloperAccessSection } from "./sections/developer-access-section";
import { IncomeSection } from "./sections/income-section";
import { ProfileSection } from "./sections/profile-section";
import { SettingsJumpNav } from "./settings-jump-nav";

export default async function SettingsPage(): Promise<ReactNode> {
  const [profile, appearance, income, developer] = await Promise.all([
    ProfileSection(),
    AppearanceSection(),
    IncomeSection(),
    DeveloperAccessSection()
  ]);

  return (
    <PageShell width="standard" className="animate-fade-in">
      <PageHeader
        eyebrow="Account / settings"
        title="Settings"
        description="Your profile, appearance, income, and API access."
      />

      <SettingsJumpNav />

      <div className="space-y-10">
        {profile}
        {appearance}
        {income}
        {developer}
      </div>

      <p className="border-t border-border/60 pt-5 text-xs leading-relaxed text-foreground-muted">
        Money is stored as integer paise and never edited after posting — corrections are recorded
        as reversal entries. Dates, budgets, and schedules use Asia/Kolkata (IST).
      </p>
    </PageShell>
  );
}
