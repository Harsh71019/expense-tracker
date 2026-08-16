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
        label: "Assets & Net Worth",
        description: "Valuations, physical assets, and equity",
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
        description: "Virtual envelope and target tracking",
        icon: "◎"
      },
      {
        href: "/recurring",
        label: "Recurring Rules",
        description: "Scheduled transaction engines",
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
    countTag: "3 Integrations",
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
}: Readonly<{ eyebrow: string; title: string; description?: string }>): ReactNode {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3.5">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent-glow/30 px-2 py-0.5 font-mono text-2xs font-bold tracking-wider text-accent uppercase">
          {eyebrow}
        </span>
        <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
      </div>
      {description !== undefined ? (
        <p className="text-xs text-foreground-muted">{description}</p>
      ) : null}
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
        eyebrow="Identity & Credentials"
        title="Profile & Session"
        description="Manage your treasury operator persona and active credentials."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <ProfileSummary profile={profile} email={email} />
        <EditDisplayNameForm initialProfile={profile} />
      </div>

      {/* Developer API Token Quick-Access Banner */}
      <section className="glass-card flex flex-col gap-3.5 rounded-2xl p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-glow/40 text-lg text-accent">
            ⚿
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground">Personal API Access Tokens</h3>
            <p className="text-xs text-foreground-muted">
              Provision scoped API keys for programmatic automation, shortcuts, and CLI scripts.
            </p>
          </div>
        </div>
        <Link
          href="/settings/api-keys"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-surface-muted/60 px-4 py-2 text-xs font-bold text-foreground transition-all hover:border-accent/40 hover:bg-surface-elevated hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span>Manage API Keys</span>
          <span aria-hidden="true">→</span>
        </Link>
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
          <p className="truncate font-mono text-2xs text-foreground-muted">
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
      <SettingsSectionHeader
        eyebrow="Visual Engineering"
        title="Workspace Appearance"
        description="Tailor the theme system and active interface palette."
      />

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
              <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                🎨 Live System Tokens
              </p>
              <span className="font-mono text-2xs font-semibold text-accent">
                Active Theme Tokens
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 rounded-lg border border-accent/30 bg-accent-glow/30 p-2.5 text-center">
                <span className="font-mono text-2xs font-bold text-accent uppercase">Accent</span>
                <span className="text-xs font-semibold text-foreground">Interactive</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-lg border border-income/30 bg-income/10 p-2.5 text-center">
                <span className="font-mono text-2xs font-bold text-income uppercase">Income</span>
                <span className="text-xs font-semibold text-income">+ Positive</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-lg border border-expense/30 bg-expense/10 p-2.5 text-center">
                <span className="font-mono text-2xs font-bold text-expense uppercase">Expense</span>
                <span className="text-xs font-semibold text-expense">- Outflow</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-muted p-2.5 text-center">
                <span className="font-mono text-2xs font-bold text-foreground-muted uppercase">
                  Surface
                </span>
                <span className="text-xs font-semibold text-foreground-muted">Elevated</span>
              </div>
            </div>
          </section>

          {/* Mini UI Card Preview */}
          <section className="glass-card rounded-2xl p-4 shadow-xs sm:p-5">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
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
                    <p className="text-2xs text-foreground-muted">Primary Account</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-bold text-income">+₹1,24,500.00</p>
                  <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-mono text-2xs font-bold text-accent">
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
      <SettingsSectionHeader
        eyebrow="Modules Directory"
        title="Manage TreasuryOps"
        description="All 12 ledger modules, rules, and integration endpoints."
      />

      <ManagementToolsGrid groups={managementGroups} />
    </div>
  );
}

function InvariantsSettingsPanel(): ReactNode {
  return (
    <div className="space-y-6 animate-fade-in">
      <SettingsSectionHeader
        eyebrow="Ledger Invariants"
        title="Double-Entry Rules &amp; Money Invariants"
        description="Architectural safety guarantees ensuring mathematical ledger truth."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Invariant 1 */}
        <section className="glass-card rounded-2xl p-4 shadow-xs sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/30 bg-accent-glow/40 font-mono text-xs font-bold text-accent">
              01
            </span>
            <h3 className="text-sm font-bold text-foreground">Exact Integer Minor Units</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            All monetary fields are stored and computed strictly as positive integer paise (
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-2xs text-accent">
              amountMinor
            </code>
            ). Floating-point arithmetic never touches money, completely preventing precision drift
            and rounding leaks.
          </p>
          <div className="mt-3 rounded-xl border border-border/80 bg-surface-muted/50 p-2.5 font-mono text-2xs text-foreground-muted">
            ₹1.00 = 100 paise · Zero IEEE 754 drift
          </div>
        </section>

        {/* Invariant 2 */}
        <section className="glass-card rounded-2xl p-4 shadow-xs sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/30 bg-accent-glow/40 font-mono text-xs font-bold text-accent">
              02
            </span>
            <h3 className="text-sm font-bold text-foreground">Append-Only Immutability</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            The ledger is append-only. Monetary records are never edited or deleted. Corrections are
            strictly posted as paired compensating reversal entries via the{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-2xs text-accent">
              ReversalService
            </code>
            , creating an unbreakable historical audit trail.
          </p>
          <div className="mt-3 rounded-xl border border-border/80 bg-surface-muted/50 p-2.5 font-mono text-2xs text-foreground-muted">
            Immutable log · Reversal pairs preserve history
          </div>
        </section>

        {/* Invariant 3 */}
        <section className="glass-card rounded-2xl p-4 shadow-xs sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/30 bg-accent-glow/40 font-mono text-xs font-bold text-accent">
              03
            </span>
            <h3 className="text-sm font-bold text-foreground">Atomic Transaction Isolation</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            Every monetary mutation executes inside an atomic Postgres transaction with automatic
            retry on serialization and deadlock errors (
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-2xs text-accent">
              40001
            </code>
            /
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-2xs text-accent">
              40P01
            </code>
            ). Account balances and audit records update in tandem.
          </p>
          <div className="mt-3 rounded-xl border border-border/80 bg-surface-muted/50 p-2.5 font-mono text-2xs text-foreground-muted">
            ACID boundaries · withTxn orchestrator
          </div>
        </section>

        {/* Invariant 4 */}
        <section className="glass-card rounded-2xl p-4 shadow-xs sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/30 bg-accent-glow/40 font-mono text-xs font-bold text-accent">
              04
            </span>
            <h3 className="text-sm font-bold text-foreground">Timezone Anchor (IST)</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            All calendar boundaries, monthly rollup aggregations, cron triggers, and budget health
            cycles are anchored in{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-2xs text-accent">
              Asia/Kolkata
            </code>{" "}
            (UTC+5:30) rather than runtime host clock variables.
          </p>
          <div className="mt-3 rounded-xl border border-border/80 bg-surface-muted/50 p-2.5 font-mono text-2xs text-foreground-muted">
            Consistent monthly cycles · Deterministic rollups
          </div>
        </section>
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
  if (activeTab === "invariants") {
    return <InvariantsSettingsPanel />;
  }
  return ProfileSettingsPanel();
}
