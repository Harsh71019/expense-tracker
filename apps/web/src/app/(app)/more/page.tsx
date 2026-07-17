import type { ReactNode } from "react";
import Link from "next/link";

import { SignOutButton } from "@/features/auth";
import { ProfileSummary } from "@/features/profile";
import { getProfile } from "@/features/profile/server/get-profile";
import { getSession } from "@/lib/api/session";

const settingsLinks = [
  ["/accounts", "Accounts", "Create and archive ledger accounts."],
  ["/categories", "Categories", "Manage expense and income categories."],
  ["/category-rules", "Automatic categories", "Configure import suggestions."],
  ["/assets", "Assets", "Track valuations and liabilities."],
  ["/transfers/new", "Transfer between accounts", "Record a two-leg movement."],
  ["/export", "Export data", "Download posted transactions as CSV."]
] as const;

export default async function MorePage(): Promise<ReactNode> {
  const [session, profile] = await Promise.all([getSession(), getProfile()]);
  const email = session?.user.email ?? "";

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs tracking-widest text-foreground-muted uppercase">
          Settings
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Your account</h1>
      </div>

      <ProfileSummary profile={profile} email={email} />

      <Link
        href="/imports"
        className="block rounded-xl border border-border bg-surface-elevated p-5 shadow-sm transition-colors hover:border-accent/40 hover:bg-accent/5"
      >
        <p className="font-mono text-xs tracking-widest text-foreground-muted uppercase">
          Statements
        </p>
        <p className="mt-2 text-base font-medium text-foreground">Import statement</p>
        <p className="mt-1 text-sm text-foreground-muted">Upload, review, and post a CSV safely.</p>
      </Link>

      <div className="grid gap-3 sm:grid-cols-2">
        {settingsLinks.map(([href, label, description]) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-border bg-surface-elevated p-4 transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            <p className="font-semibold">{label}</p>
            <p className="mt-1 text-sm text-foreground-muted">{description}</p>
          </Link>
        ))}
      </div>

      <div className="md:hidden">
        <SignOutButton />
      </div>
    </section>
  );
}
