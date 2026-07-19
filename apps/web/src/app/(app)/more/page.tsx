import type { ReactNode } from "react";
import Link from "next/link";

import { AccentPicker } from "@/components/ui/accent-picker";
import { SignOutButton } from "@/features/auth";
import { ProfileSummary } from "@/features/profile";
import { getProfile } from "@/features/profile/server/get-profile";
import { getStoredAccent } from "@/lib/accent-server";
import { getSession } from "@/lib/api/session";

const settingsLinks = [
  ["/accounts", "Accounts", "Create and archive ledger accounts."],
  ["/categories", "Categories", "Manage expense and income categories."],
  ["/category-rules", "Automatic categories", "Configure import suggestions."],
  ["/assets", "Assets", "Track valuations and liabilities."],
  ["/transfers", "Transfers", "Move money between your own accounts."],
  ["/export", "Export data", "Download posted transactions as CSV."]
] as const;

export default async function MorePage(): Promise<ReactNode> {
  const [session, profile, accent] = await Promise.all([
    getSession(),
    getProfile(),
    getStoredAccent()
  ]);
  const email = session?.user.email ?? "";

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Your account</h1>

      <ProfileSummary profile={profile} email={email} />

      <AccentPicker current={accent} />

      <div className="overflow-hidden rounded-xl border border-border">
        <Link
          href="/imports"
          className="block border-b border-border px-5 py-4 transition-colors hover:bg-surface-muted/50"
        >
          <p className="font-mono text-[10px] tracking-widest text-foreground-muted uppercase">
            Statements
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">Import statement</p>
          <p className="mt-0.5 text-sm text-foreground-muted">
            Upload, review, and post a CSV safely.
          </p>
        </Link>
        {settingsLinks.map(([href, label, description], index) => (
          <Link
            key={href}
            href={href}
            className={`block px-5 py-4 transition-colors hover:bg-surface-muted/50 ${
              index < settingsLinks.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>
          </Link>
        ))}
      </div>

      <SignOutButton />
    </section>
  );
}
