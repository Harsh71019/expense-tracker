import Link from "next/link";
import type { ReactNode } from "react";

import { AccentPicker } from "@/components/ui/accent-picker";
import { ThemePreferenceForm } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/features/auth";
import { EditDisplayNameForm, ProfileSummary } from "@/features/profile";
import { getProfile } from "@/features/profile/server/get-profile";
import { getStoredAccent } from "@/lib/accent-server";
import { getSession } from "@/lib/api/session";
import { getStoredTheme } from "@/lib/theme-server";

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

      <div className="grid gap-6 xl:grid-cols-2">
        {managementGroups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`settings-group-${group.id}`}
            className={`glass-card rounded-2xl p-5 shadow-sm transition-all duration-200 ${
              group.id === "ledger" ? "xl:col-span-2" : ""
            }`}
          >
            <header className="flex flex-col gap-1 pb-4 border-b border-border/60">
              <div className="flex items-center justify-between">
                <h3
                  id={`settings-group-${group.id}`}
                  className="text-lg font-bold tracking-tight text-foreground"
                >
                  {group.label}
                </h3>
                <span className="font-mono text-[10px] font-bold text-accent uppercase bg-accent-glow/50 border border-accent/20 px-2 py-0.5 rounded-full">
                  {group.countTag}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-foreground-muted pretty-text">
                {group.description}
              </p>
            </header>

            <div
              className={`mt-4 grid gap-3 ${
                group.id === "ledger"
                  ? "sm:grid-cols-2 xl:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2"
              }`}
            >
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative flex min-h-18 items-center gap-3.5 rounded-xl border border-border/70 bg-surface-elevated/70 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent-glow/20 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:hover:translate-y-0"
                >
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-glow/60 font-mono text-lg font-bold text-accent transition-transform duration-200 group-hover:scale-110"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold tracking-tight text-foreground group-hover:text-accent transition-colors">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-foreground-muted pretty-text">
                      {item.description}
                    </span>
                  </span>
                  <span
                    className="font-mono text-sm text-foreground-muted transition-all duration-200 group-hover:translate-x-1 group-hover:text-accent motion-reduce:group-hover:translate-x-0"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
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
