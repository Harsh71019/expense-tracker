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
  title
}: Readonly<{ eyebrow: string; title: string; description?: string }>): ReactNode {
  return (
    <header className="flex items-center justify-between border-b border-border/60 pb-3">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent-glow/30 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-accent uppercase">
          {eyebrow}
        </span>
        <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
      </div>
    </header>
  );
}

async function ProfileSettingsPanel(): Promise<ReactNode> {
  const [session, profile] = await Promise.all([getSession(), getProfile()]);
  const email = session?.user.email ?? "";
  const displayName = profile?.displayName ?? email;

  return (
    <div className="space-y-6 animate-fade-in">
      <SettingsSectionHeader eyebrow="Identity" title="Profile & Identity" />

      <div className="grid gap-4 md:grid-cols-2">
        <ProfileSummary profile={profile} email={email} />
        <EditDisplayNameForm initialProfile={profile} />
      </div>

      {/* Financial Workspace Invariants */}
      <section className="glass-card rounded-2xl p-4 shadow-xs sm:p-5">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Financial Architecture &amp; System Invariants
            </h3>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Core ledger rules governing your personal treasury calculations.
            </p>
          </div>
          <span className="rounded-full border border-border/80 bg-surface-muted px-2.5 py-0.5 font-mono text-[10px] font-bold text-foreground-muted">
            Non-Negotiable
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-surface-muted/40 p-3.5">
            <span className="font-mono text-[10px] font-bold text-accent uppercase">Currency</span>
            <p className="mt-1 text-sm font-bold text-foreground">INR (₹)</p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              All transactions &amp; balances in Indian Rupees.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-surface-muted/40 p-3.5">
            <span className="font-mono text-[10px] font-bold text-accent uppercase">
              Math Precision
            </span>
            <p className="mt-1 text-sm font-bold text-foreground">Integer Paise</p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Zero floating-point rounding error across operations.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-surface-muted/40 p-3.5">
            <span className="font-mono text-[10px] font-bold text-accent uppercase">
              Ledger Strategy
            </span>
            <p className="mt-1 text-sm font-bold text-foreground">Append-Only</p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Corrections happen via reversal entries, never editing.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-surface-muted/40 p-3.5">
            <span className="font-mono text-[10px] font-bold text-accent uppercase">
              Timezone Anchor
            </span>
            <p className="mt-1 text-sm font-bold text-foreground">Asia/Kolkata (IST)</p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Monthly rollups, crons, and calendar days in IST.
            </p>
          </div>
        </div>
      </section>

      {/* Account Session Security Card */}
      <section className="glass-card flex flex-col gap-3 rounded-2xl p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-income shadow-glow" aria-hidden="true" />
            <h3 className="truncate text-xs font-semibold text-foreground sm:text-sm">
              Signed in as <span className="text-accent font-bold">{displayName}</span>
            </h3>
          </div>
          <p className="truncate font-mono text-[11px] text-foreground-muted">
            {email} · Active Browser Session
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
      <SettingsSectionHeader eyebrow="Workspace" title="Theme & Appearance Studio" />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-card space-y-4 rounded-2xl p-4 shadow-xs sm:p-5">
          <div className="rounded-xl border border-border/80 bg-surface-muted/40 p-3.5">
            <ThemePreferenceForm current={theme} />
          </div>

          <div>
            <AccentPicker current={accent} />
          </div>
        </section>

        {/* Live Color System Tokens & UI Preview */}
        <div className="space-y-4">
          <section className="glass-card rounded-2xl p-4 shadow-xs sm:p-5">
            <div className="flex items-center justify-between pb-2.5 border-b border-border/60">
              <p className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
                🎨 Live System Tokens
              </p>
              <span className="font-mono text-[10px] font-semibold text-accent">
                Active Theme Tokens
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 rounded-lg border border-accent/30 bg-accent-glow/30 p-2.5 text-center">
                <span className="font-mono text-[9px] font-bold text-accent uppercase">Accent</span>
                <span className="text-xs font-semibold text-foreground">Interactive</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-lg border border-income/30 bg-income/10 p-2.5 text-center">
                <span className="font-mono text-[9px] font-bold text-income uppercase">Income</span>
                <span className="text-xs font-semibold text-income">+ Positive</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-lg border border-expense/30 bg-expense/10 p-2.5 text-center">
                <span className="font-mono text-[9px] font-bold text-expense uppercase">
                  Expense
                </span>
                <span className="text-xs font-semibold text-expense">- Outflow</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-muted p-2.5 text-center">
                <span className="font-mono text-[9px] font-bold text-foreground-muted uppercase">
                  Surface
                </span>
                <span className="text-xs font-semibold text-foreground-muted">Elevated</span>
              </div>
            </div>
          </section>

          {/* Mini UI Card Preview */}
          <section className="glass-card rounded-2xl p-4 shadow-xs sm:p-5">
            <p className="font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
              ✨ Live Interface Preview
            </p>
            <div className="mt-3 rounded-xl border border-border bg-surface-elevated p-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground font-mono text-xs font-bold shadow-xs">
                    ₹
                  </span>
                  <div>
                    <p className="text-xs font-bold text-foreground">Treasury Balance</p>
                    <p className="text-[10px] text-foreground-muted">Primary Account</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-bold text-emerald-500">+₹1,24,500.00</p>
                  <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-accent">
                    Active
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ManagementSettingsPanel(): ReactNode {
  return (
    <div className="space-y-6 animate-fade-in">
      <SettingsSectionHeader eyebrow="Directory" title="Tools &amp; Automations Directory" />

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
