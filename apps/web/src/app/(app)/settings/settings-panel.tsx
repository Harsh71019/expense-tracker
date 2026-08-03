import type { ReactNode } from "react";

import { AccentPicker } from "@/components/ui/accent-picker";
import { ThemePreferenceForm } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/features/auth";
import { EditDisplayNameForm, ProfileSummary } from "@/features/profile";
import { getProfile } from "@/features/profile/server/get-profile";
import { getStoredAccent } from "@/lib/accent-server";
import { getSession } from "@/lib/api/session";
import { getStoredTheme } from "@/lib/theme-server";

import { ManagementToolsGrid } from "./management-tools-grid";
import type { SettingsTab } from "./settings-tabs";

const managementGroups = [
  {
    id: "ledger",
    label: "Money & ledger",
    countTag: "5 Ledger Tools",
    description: "Set up where money lives and how double-entry records are organized.",
    items: [
      {
        href: "/accounts",
        label: "Accounts",
        description: "Bank, card, cash, and wallets",
        icon: "▦"
      },
      {
        href: "/categories",
        label: "Categories",
        description: "Transaction classification taxonomy",
        icon: "◎"
      },
      {
        href: "/transfers",
        label: "Transfers",
        description: "Move money between accounts safely",
        icon: "⤢"
      },
      {
        href: "/bills",
        label: "Credit card bills",
        description: "Statements, reconciliation, and payments",
        icon: "▤"
      },
      {
        href: "/assets",
        label: "Assets",
        description: "Net worth tracking and asset valuations",
        icon: "◈"
      }
    ]
  },
  {
    id: "planning",
    label: "Planning & automation",
    countTag: "4 Automations",
    description: "Plan ahead and eliminate repetitive expense tracker work.",
    items: [
      {
        href: "/budgets",
        label: "Budgets",
        description: "Monthly spending limits & health",
        icon: "◫"
      },
      {
        href: "/goals",
        label: "Goals",
        description: "Savings targets and progress tracking",
        icon: "◎"
      },
      {
        href: "/recurring",
        label: "Recurring",
        description: "Scheduled transaction rules",
        icon: "↻"
      },
      {
        href: "/category-rules",
        label: "Category rules",
        description: "Automatic classification engine",
        icon: "⌁"
      }
    ]
  },
  {
    id: "data",
    label: "Data & access",
    countTag: "3 Integration Tools",
    description: "Bring CSV data in, export structured ledger files, or issue API tokens.",
    items: [
      { href: "/imports", label: "Imports", description: "CSV statement import parser", icon: "↧" },
      { href: "/export", label: "Export", description: "Download ledger data as CSV", icon: "↥" },
      {
        href: "/settings/api-keys",
        label: "API keys",
        description: "Personal access tokens for external scripts",
        icon: "⚿"
      }
    ]
  }
] as const;

function SettingsSectionHeader({
  eyebrow,
  title,
  description
}: Readonly<{ eyebrow: string; title: string; description: string }>): ReactNode {
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent-glow/30 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.18em] text-accent uppercase">
          {eyebrow}
        </span>
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-foreground-muted pretty-text">
        {description}
      </p>
    </header>
  );
}

async function ProfileSettingsPanel(): Promise<ReactNode> {
  const [session, profile] = await Promise.all([getSession(), getProfile()]);
  const email = session?.user.email ?? "";
  const displayName = profile?.displayName ?? email;

  return (
    <div className="space-y-6 animate-fade-in">
      <SettingsSectionHeader
        eyebrow="Identity"
        title="Profile & Session"
        description="Manage how your identity appears across TreasuryOps and monitor active authentication sessions."
      />

      <ProfileSummary profile={profile} email={email} />

      <EditDisplayNameForm initialProfile={profile} />

      {/* Account Session Security Card */}
      <section className="glass-card flex flex-col gap-4 rounded-2xl p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-income shadow-glow" aria-hidden="true" />
            <h3 className="truncate text-sm font-semibold text-foreground">
              Signed in as <span className="text-accent">{displayName}</span>
            </h3>
          </div>
          <p className="truncate font-mono text-xs text-foreground-muted">
            {email} · Current Browser Session
          </p>
        </div>
        <SignOutButton />
      </section>
    </div>
  );
}

async function AppearanceSettingsPanel(): Promise<ReactNode> {
  const [accent, theme] = await Promise.all([getStoredAccent(), getStoredTheme()]);

  return (
    <div className="space-y-6 animate-fade-in">
      <SettingsSectionHeader
        eyebrow="Workspace"
        title="Workspace Appearance"
        description="Customize how TreasuryOps looks on this browser. Core monetary semantics (income green, expense red) remain clear and consistent."
      />

      <section className="glass-card space-y-6 rounded-2xl p-5 shadow-sm sm:p-6">
        <div className="rounded-xl border border-border/80 bg-surface-muted/40 p-4 sm:p-5">
          <ThemePreferenceForm current={theme} />
        </div>

        <div>
          <AccentPicker current={accent} />
        </div>

        {/* Live Color System & Contrast Preview */}
        <div className="rounded-xl border border-border/80 bg-surface-elevated/70 p-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <p className="font-mono text-[11px] font-bold tracking-wider text-foreground-muted uppercase">
              🎨 Live Workspace Tokens
            </p>
            <span className="text-[11px] font-medium text-accent">Active Theme Tokens</span>
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-lg border border-accent/30 bg-accent-glow/30 p-2.5 text-center">
              <span className="font-mono text-[10px] font-bold text-accent uppercase">Accent</span>
              <span className="text-xs font-semibold text-foreground">Interactive</span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-income/30 bg-income/10 p-2.5 text-center">
              <span className="font-mono text-[10px] font-bold text-income uppercase">Income</span>
              <span className="text-xs font-semibold text-income">+ Positive</span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-expense/30 bg-expense/10 p-2.5 text-center">
              <span className="font-mono text-[10px] font-bold text-expense uppercase">
                Expense
              </span>
              <span className="text-xs font-semibold text-expense">- Outflow</span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-muted p-2.5 text-center">
              <span className="font-mono text-[10px] font-bold text-foreground-muted uppercase">
                Muted
              </span>
              <span className="text-xs font-semibold text-foreground-muted">Secondary</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ManagementSettingsPanel(): ReactNode {
  return (
    <div className="space-y-6 animate-fade-in">
      <SettingsSectionHeader
        eyebrow="Workspace"
        title="Manage TreasuryOps"
        description="Double-entry ledger configuration, automated rules, and data operations—categorized by task."
      />

      <ManagementToolsGrid groups={managementGroups} />
    </div>
  );
}

export async function SettingsPanel({
  activeTab
}: Readonly<{ activeTab: SettingsTab }>): Promise<ReactNode> {
  if (activeTab === "appearance") {
    return AppearanceSettingsPanel();
  }
  if (activeTab === "management") {
    return <ManagementSettingsPanel />;
  }
  return ProfileSettingsPanel();
}
