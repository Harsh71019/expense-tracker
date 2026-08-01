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
    description: "Set up where money lives and how entries are organized.",
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
        description: "Transaction classification",
        icon: "◎"
      },
      {
        href: "/transfers",
        label: "Transfers",
        description: "Move money between accounts",
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
        description: "Net worth and valuations",
        icon: "◈"
      }
    ]
  },
  {
    id: "planning",
    label: "Planning & automation",
    description: "Plan ahead and reduce repetitive ledger work.",
    items: [
      { href: "/budgets", label: "Budgets", description: "Monthly spending plans", icon: "◫" },
      { href: "/goals", label: "Goals", description: "Savings targets and progress", icon: "◎" },
      {
        href: "/recurring",
        label: "Recurring",
        description: "Scheduled transactions",
        icon: "↻"
      },
      {
        href: "/category-rules",
        label: "Category rules",
        description: "Automatic classification",
        icon: "⌁"
      }
    ]
  },
  {
    id: "data",
    label: "Data & access",
    description: "Bring data in, take it out, or connect another app.",
    items: [
      { href: "/imports", label: "Imports", description: "CSV statement imports", icon: "↧" },
      { href: "/export", label: "Export", description: "Download transactions", icon: "↥" },
      {
        href: "/settings/api-keys",
        label: "API keys",
        description: "Tokens for external apps",
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
    <header>
      <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-accent uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-foreground-muted">
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
    <div className="space-y-5">
      <SettingsSectionHeader
        eyebrow="Identity"
        title="Profile & session"
        description="Manage how your name appears and control the session active in this browser."
      />

      <ProfileSummary profile={profile} email={email} />

      <EditDisplayNameForm initialProfile={profile} />

      <section className="flex flex-col gap-4 rounded-2xl border border-expense/25 bg-surface-elevated p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            Signed in as {displayName}
          </h2>
          <p className="mt-1 truncate text-xs text-foreground-muted">{email} · this browser</p>
        </div>
        <SignOutButton />
      </section>
    </div>
  );
}

async function AppearanceSettingsPanel(): Promise<ReactNode> {
  const [accent, theme] = await Promise.all([getStoredAccent(), getStoredTheme()]);

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        eyebrow="Workspace"
        title="Appearance"
        description="Choose how TreasuryOps looks on this browser. Ledger meaning and category colors stay consistent."
      />

      <section className="rounded-2xl border border-border bg-surface-elevated p-5 sm:p-6">
        <div className="rounded-xl border border-border bg-surface-muted/50 p-4 sm:p-5">
          <ThemePreferenceForm current={theme} />
        </div>

        <div className="mt-4">
          <AccentPicker current={accent} />
        </div>
      </section>
    </div>
  );
}

function ManagementSettingsPanel(): ReactNode {
  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        eyebrow="Workspace"
        title="Manage TreasuryOps"
        description="Ledger setup, planning tools, and data controls are grouped by the job they help you finish."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {managementGroups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`settings-group-${group.id}`}
            className={`rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5 ${
              group.id === "ledger" ? "xl:col-span-2" : ""
            }`}
          >
            <header className="px-1 pb-4">
              <h3
                id={`settings-group-${group.id}`}
                className="text-base font-bold tracking-tight text-foreground"
              >
                {group.label}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                {group.description}
              </p>
            </header>

            <div
              className={`grid gap-2 ${
                group.id === "ledger" ? "sm:grid-cols-2 xl:grid-cols-3" : ""
              }`}
            >
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex min-h-17 items-center gap-3 rounded-xl border border-border bg-surface-muted/50 p-3.5 transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent-glow/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:hover:translate-y-0"
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-glow text-lg text-accent"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-foreground-muted">
                      {item.description}
                    </span>
                  </span>
                  <span
                    className="font-mono text-sm text-foreground-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:group-hover:translate-x-0"
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
