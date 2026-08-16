import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AccentPicker } from "@/components/ui/accent-picker";
import { Badge } from "@/components/ui/badge";
import { ThemePreferenceForm } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/features/auth";
import { EditDisplayNameForm, ProfileSummary } from "@/features/profile";
import { getProfile } from "@/features/profile/server/get-profile";
import { getStoredAccent } from "@/lib/accent-server";
import { getSession } from "@/lib/api/session";
import { getStoredTheme } from "@/lib/theme-server";

import {
  InvariantPaiseCalculator,
  InvariantReversalSimulator
} from "./invariants-interactive-tools";
import { LiveUiPreview } from "./live-ui-preview";
import { ManagementToolsGrid, type ManagementGroup } from "./management-tools-grid";
import type { SettingsTab } from "./settings-tabs";

const managementGroups: readonly ManagementGroup[] = [
  {
    id: "ledger",
    label: "Money & ledger",
    countTag: "5 Core Subsystems",
    description: "Account balances, taxonomies, atomic transfers, and net worth registry.",
    items: [
      {
        href: "/accounts",
        label: "Accounts",
        description: "Bank, credit card, cash & digital wallet balances",
        iconName: "Landmark",
        badge: "Double-Entry"
      },
      {
        href: "/categories",
        label: "Categories",
        description: "Transaction classification hierarchy & tax mix",
        iconName: "Tag",
        badge: "Taxonomy"
      },
      {
        href: "/transfers",
        label: "Transfers",
        description: "Atomic double-entry funds movement between accounts",
        iconName: "ArrowLeftRight",
        badge: "Atomic Pair"
      },
      {
        href: "/bills",
        label: "Credit card bills",
        description: "Statements, payment reconciliation & unbilled balances",
        iconName: "CreditCard",
        badge: "Reconciliation"
      },
      {
        href: "/assets",
        label: "Assets & Net Worth",
        description: "Physical assets, investments, equity & valuations",
        iconName: "Building2",
        badge: "Valuations"
      }
    ]
  },
  {
    id: "planning",
    label: "Planning & automation",
    countTag: "4 Rule Engines",
    description: "Monthly spending envelopes, target funds, and recurring engines.",
    items: [
      {
        href: "/budgets",
        label: "Budgets",
        description: "Monthly category envelopes & real-time threshold health",
        iconName: "PieChart",
        badge: "Envelopes"
      },
      {
        href: "/goals",
        label: "Goals",
        description: "Target fund tracking & virtual envelope progress",
        iconName: "Target",
        badge: "Target Funds"
      },
      {
        href: "/recurring",
        label: "Recurring Rules",
        description: "Scheduled recurring streams & subscription reconciliation",
        iconName: "Repeat",
        badge: "Engines"
      },
      {
        href: "/category-rules",
        label: "Category rules",
        description: "Automatic classification pattern engine for imports",
        iconName: "Sparkles",
        badge: "Classification"
      }
    ]
  },
  {
    id: "data",
    label: "Data & access",
    countTag: "3 Integration Tools",
    description: "CSV statement parsing, ledger export, and scoped REST tokens.",
    items: [
      {
        href: "/imports",
        label: "Imports",
        description: "Multi-bank CSV parser with duplicate detection",
        iconName: "FileSpreadsheet",
        badge: "CSV Pipeline"
      },
      {
        href: "/export",
        label: "Export",
        description: "Formula-safe sanitized CSV dumps of transaction history",
        iconName: "Download",
        badge: "Sanitized CSV"
      },
      {
        href: "/settings/api-keys",
        label: "API keys",
        description: "Scoped personal access tokens for automation scripts",
        iconName: "KeyRound",
        badge: "REST Tokens"
      }
    ]
  }
];

function SettingsSectionHeader({
  eyebrow,
  title,
  description
}: Readonly<{ eyebrow: string; title: string; description?: string }>): ReactNode {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3.5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent-glow/40 px-2 py-0.5 font-mono text-2xs font-bold tracking-wider text-accent uppercase">
            {eyebrow}
          </span>
          <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
        </div>
        {description !== undefined ? (
          <p className="text-xs text-foreground-muted">{description}</p>
        ) : null}
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
      <SettingsSectionHeader
        eyebrow="Identity & Security"
        title="Operator Profile & Authentication"
        description="Manage your treasury operator persona, display credentials, and session security."
      />

      {/* Operator Summary Hero Card */}
      <div className="grid gap-4 md:grid-cols-2">
        <ProfileSummary profile={profile} email={email} />
        <EditDisplayNameForm initialProfile={profile} />
      </div>

      {/* Quick Navigation Shortcuts */}
      <section className="glass-card flex flex-col justify-between rounded-2xl p-4 sm:p-5 shadow-xs">
        <header className="flex items-center justify-between pb-2 border-b border-border/60">
          <h3 className="text-xs font-bold tracking-wider uppercase text-foreground-muted">
            Quick Ledger Navigation
          </h3>
          <span className="font-mono text-2xs text-accent font-semibold">Fast Jump</span>
        </header>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Link
            href="/goals"
            className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-muted/60 p-2.5 text-xs font-bold text-foreground transition-all hover:border-accent/40 hover:bg-surface-elevated hover:text-accent"
          >
            <span>Goals</span>
            <span className="text-foreground-muted text-2xs">→</span>
          </Link>
          <Link
            href="/transfers"
            className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-muted/60 p-2.5 text-xs font-bold text-foreground transition-all hover:border-accent/40 hover:bg-surface-elevated hover:text-accent"
          >
            <span>Transfers</span>
            <span className="text-foreground-muted text-2xs">→</span>
          </Link>
          <Link
            href="/accounts"
            className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-muted/60 p-2.5 text-xs font-bold text-foreground transition-all hover:border-accent/40 hover:bg-surface-elevated hover:text-accent"
          >
            <span>Accounts</span>
            <span className="text-foreground-muted text-2xs">→</span>
          </Link>
          <Link
            href="/imports"
            className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-muted/60 p-2.5 text-xs font-bold text-foreground transition-all hover:border-accent/40 hover:bg-surface-elevated hover:text-accent"
          >
            <span>Imports</span>
            <span className="text-foreground-muted text-2xs">→</span>
          </Link>
        </div>
      </section>

      {/* Developer API Token Card */}
      <section className="glass-card flex flex-col gap-4 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-glow text-accent ring-1 ring-accent/25">
              <KeyRound className="h-5 w-5" aria-hidden={true} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Developer API Access &amp; Tokens
              </h3>
              <p className="text-xs text-foreground-muted">
                Provision scoped API keys for automation scripts, Raycast extensions, and cron
                syncs.
              </p>
            </div>
          </div>

          <Link
            href="/settings/api-keys"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-surface-muted/80 px-4 py-2 text-xs font-bold text-foreground transition-all hover:border-accent/40 hover:bg-surface-elevated hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent shrink-0"
          >
            <span>Manage API Keys</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden={true} />
          </Link>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 border-t border-border/50 pt-3">
          <div className="rounded-xl border border-border/60 bg-surface-muted/40 p-2.5 font-mono text-2xs">
            <span className="font-bold text-foreground">read:transactions</span>
            <p className="text-foreground-muted mt-0.5">Read ledger balances &amp; txn rows</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-surface-muted/40 p-2.5 font-mono text-2xs">
            <span className="font-bold text-foreground">write:transactions</span>
            <p className="text-foreground-muted mt-0.5">Post new append-only transactions</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-surface-muted/40 p-2.5 font-mono text-2xs">
            <span className="font-bold text-foreground">export:csv</span>
            <p className="text-foreground-muted mt-0.5">Stream formula-safe ledger CSV dumps</p>
          </div>
        </div>
      </section>

      {/* Session Security & Sign Out Card */}
      <section className="glass-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-income/30 bg-income/10 text-income">
            <ShieldCheck className="h-5 w-5" aria-hidden={true} />
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full bg-income shadow-glow animate-pulse"
                aria-hidden="true"
              />
              <h3 className="truncate text-xs font-semibold text-foreground sm:text-sm">
                Signed in as <span className="text-accent font-bold">{displayName}</span>
              </h3>
            </div>
            <p className="truncate font-mono text-2xs text-foreground-muted">
              {email} · Active Browser Session
            </p>
          </div>
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
        eyebrow="Visual System"
        title="Appearance &amp; Theme Studio"
        description="Personalize your color system, theme modes, and view real-time ledger component rendering."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Theme & Accent Selectors */}
        <div className="space-y-6">
          <section className="glass-card space-y-4 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="rounded-xl border border-border/80 bg-surface-muted/40 p-3.5">
              <ThemePreferenceForm current={theme} />
            </div>

            <div>
              <AccentPicker current={accent} />
            </div>
          </section>
        </div>

        {/* Right Column: Live Dynamic UI Preview & Typography Specs */}
        <div className="space-y-6">
          <LiveUiPreview />

          {/* Typography & Display Specifications */}
          <section className="glass-card rounded-2xl p-4 sm:p-5 shadow-xs">
            <header className="flex items-center justify-between pb-2 border-b border-border/60">
              <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                📐 Interface Engineering Specs
              </p>
              <span className="font-mono text-2xs font-semibold text-accent">
                WCAG AAA Compliant
              </span>
            </header>

            <div className="mt-3 space-y-2.5 text-xs text-foreground-muted">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-muted/40 p-2.5 font-mono text-2xs">
                <span className="font-bold text-foreground">Tabular Numbers</span>
                <span>font-variant-numeric: tabular-nums</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-muted/40 p-2.5 font-mono text-2xs">
                <span className="font-bold text-foreground">Money Precision</span>
                <span>Integer Minor Units (1 INR = 100 Paise)</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-muted/40 p-2.5 font-mono text-2xs">
                <span className="font-bold text-foreground">Timezone Standard</span>
                <span>Asia/Kolkata (IST · UTC+5:30)</span>
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
        title="Ledger Subsystems &amp; Tools Directory"
        description="Unified directory for all 12 accounting subsystems, automation rules, and data pipelines."
      />

      <ManagementToolsGrid groups={managementGroups} />
    </div>
  );
}

function InvariantsSettingsPanel(): ReactNode {
  return (
    <div className="space-y-6 animate-fade-in">
      <SettingsSectionHeader
        eyebrow="Mathematical Guarantees"
        title="Double-Entry Rules &amp; Ledger Invariants"
        description="Non-negotiable architectural safety guarantees ensuring mathematical correctness and tamper-evident history."
      />

      {/* Overview Banner */}
      <div className="glass-card relative overflow-hidden rounded-2xl border-l-4 border-l-accent p-4 sm:p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-glow text-accent ring-1 ring-accent/25">
            <ShieldCheck className="h-5 w-5" aria-hidden={true} />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Zero-Drift Ledger Architecture</h3>
              <Badge variant="success" pulse>
                100% Invariant Compliant
              </Badge>
            </div>
            <p className="text-xs text-foreground-muted leading-relaxed">
              Every financial mutation in TreasuryOps is mathematically bounded by strict ACID
              transactions, integer minor units, and append-only compensating reversal records.
              Money records are never mutated or destroyed.
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Invariants */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Invariant 1: Exact Integer Minor Units */}
        <section className="glass-card space-y-3.5 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-glow font-mono text-xs font-bold text-accent ring-1 ring-accent/25">
                01
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">Exact Integer Minor Units</h3>
                <p className="text-2xs text-foreground-muted">Zero IEEE-754 floating-point drift</p>
              </div>
            </div>
            <span className="rounded bg-surface-muted px-2 py-0.5 font-mono text-2xs font-bold text-accent">
              amountMinor
            </span>
          </div>

          <p className="text-xs leading-relaxed text-foreground-muted">
            All monetary values are stored strictly as positive integer paise. Floating-point
            arithmetic never touches money in backend services or database columns, eliminating
            precision leakages permanently.
          </p>

          <InvariantPaiseCalculator />
        </section>

        {/* Invariant 2: Append-Only Immutability */}
        <section className="glass-card space-y-3.5 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-glow font-mono text-xs font-bold text-accent ring-1 ring-accent/25">
                02
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">Append-Only Immutability</h3>
                <p className="text-2xs text-foreground-muted">
                  Paired compensating reversal entries
                </p>
              </div>
            </div>
            <span className="rounded bg-surface-muted px-2 py-0.5 font-mono text-2xs font-bold text-accent">
              ReversalService
            </span>
          </div>

          <p className="text-xs leading-relaxed text-foreground-muted">
            The ledger is append-only. Monetary fields are never updated or deleted. Corrections are
            strictly posted as paired compensating reversals, preserving complete immutable audit
            history.
          </p>

          <InvariantReversalSimulator />
        </section>

        {/* Invariant 3: Atomic Transaction Isolation */}
        <section className="glass-card space-y-3.5 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-glow font-mono text-xs font-bold text-accent ring-1 ring-accent/25">
                03
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">Atomic Transaction Isolation</h3>
                <p className="text-2xs text-foreground-muted">
                  ACID boundaries with deadlock auto-retry
                </p>
              </div>
            </div>
            <span className="rounded bg-surface-muted px-2 py-0.5 font-mono text-2xs font-bold text-accent">
              withTxn
            </span>
          </div>

          <p className="text-xs leading-relaxed text-foreground-muted">
            Every monetary mutation executes in an atomic Postgres transaction with automatic retry
            on serialization (
            <code className="rounded bg-surface-muted px-1 font-mono text-2xs text-accent">
              40001
            </code>
            ) and deadlock (
            <code className="rounded bg-surface-muted px-1 font-mono text-2xs text-accent">
              40P01
            </code>
            ) errors. Balance cache and audit log update in tandem.
          </p>

          <div className="rounded-xl border border-border/80 bg-surface-muted/50 p-3 font-mono text-2xs text-foreground-muted space-y-1">
            <div className="flex items-center justify-between text-foreground">
              <span className="font-bold">Transaction Isolation:</span>
              <span>READ COMMITTED + Retry Loop</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Max Batch Size:</span>
              <span>≤ 200 rows per transaction</span>
            </div>
          </div>
        </section>

        {/* Invariant 4: Timezone Anchor */}
        <section className="glass-card space-y-3.5 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-glow font-mono text-xs font-bold text-accent ring-1 ring-accent/25">
                04
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">Deterministic Timezone Anchor</h3>
                <p className="text-2xs text-foreground-muted">Asia/Kolkata (IST · UTC+5:30)</p>
              </div>
            </div>
            <span className="rounded bg-surface-muted px-2 py-0.5 font-mono text-2xs font-bold text-accent">
              common/time.ts
            </span>
          </div>

          <p className="text-xs leading-relaxed text-foreground-muted">
            All calendar boundaries, monthly rollup aggregations, cron triggers, and billing cycles
            are computed strictly in{" "}
            <code className="rounded bg-surface-muted px-1 font-mono text-2xs text-accent">
              Asia/Kolkata
            </code>{" "}
            rather than host server clock variables.
          </p>

          <div className="rounded-xl border border-border/80 bg-surface-muted/50 p-3 font-mono text-2xs text-foreground-muted space-y-1">
            <div className="flex items-center justify-between text-foreground">
              <span className="font-bold">Wire Format:</span>
              <span>ISO 8601 UTC</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Aggregation Calendar:</span>
              <span>Asia/Kolkata (IST)</span>
            </div>
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
