import Link from "next/link";
import type { ReactNode } from "react";

import { AccentPicker } from "@/components/ui/accent-picker";
import { ThemePreferenceForm } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/features/auth";
import { ProfileSummary } from "@/features/profile";
import { getProfile } from "@/features/profile/server/get-profile";
import { getStoredAccent } from "@/lib/accent-server";
import { getSession } from "@/lib/api/session";
import { getStoredTheme } from "@/lib/theme-server";

const settingsLinks = [
  { href: "/accounts", label: "Accounts", description: "Bank, card, cash, and wallets", icon: "▦" },
  { href: "/categories", label: "Categories", description: "Classification taxonomy", icon: "◎" },
  {
    href: "/category-rules",
    label: "Category rules",
    description: "Auto-categorize imports",
    icon: "⌁"
  },
  { href: "/recurring", label: "Recurring", description: "Scheduled transactions", icon: "↻" },
  { href: "/assets", label: "Assets", description: "Net worth and valuations", icon: "◈" },
  { href: "/transfers", label: "Transfers", description: "Move between accounts", icon: "⤢" },
  { href: "/imports", label: "Imports", description: "CSV statement imports", icon: "↧" },
  {
    href: "/settings/api-keys",
    label: "API keys",
    description: "Tokens for external apps",
    icon: "⚿"
  },
  { href: "/export", label: "Export", description: "Download transactions as CSV", icon: "↥" }
] as const;

export default async function SettingsPage(): Promise<ReactNode> {
  const [session, profile, accent, theme] = await Promise.all([
    getSession(),
    getProfile(),
    getStoredAccent(),
    getStoredTheme()
  ]);
  const email = session?.user.email ?? "";
  const displayName = profile?.displayName ?? email;

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
      <header className="mb-1">
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
          Vyaya · Settings
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Settings
        </h1>
      </header>

      <ProfileSummary profile={profile} email={email} />

      <section className="rounded-2xl border border-border bg-surface-elevated p-5 sm:p-6">
        <header>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Appearance</h2>
          <p className="mt-1 text-sm leading-relaxed text-foreground-muted">
            Personalize how Vyaya looks. These preferences are saved to this browser only.
          </p>
        </header>

        <div className="mt-5 rounded-xl border border-border bg-surface-muted/50 p-4 sm:p-5">
          <ThemePreferenceForm current={theme} />
        </div>

        <div className="mt-4">
          <AccentPicker current={accent} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-elevated p-5 sm:p-6">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Manage Vyaya</h2>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {settingsLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-h-17 items-center gap-3 rounded-xl border border-border bg-surface-muted/50 p-3.5 transition-colors hover:border-accent/40 hover:bg-accent-glow/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-glow text-lg text-accent"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                <span className="mt-0.5 block truncate text-xs text-foreground-muted">
                  {item.description}
                </span>
              </span>
              <span
                className="font-mono text-sm text-foreground-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                aria-hidden="true"
              >
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

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
