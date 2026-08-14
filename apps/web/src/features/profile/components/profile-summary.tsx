import type { UserProfile } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { StatCard } from "@/components/ui/stat-card";

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0];
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
  const fromName = `${first ?? ""}${last ?? ""}`.toUpperCase();
  if (fromName.length > 0) {
    return fromName;
  }
  return (email.split("@")[0] ?? "?").slice(0, 2).toUpperCase();
}

export function ProfileSummary({
  profile,
  email
}: Readonly<{
  profile: UserProfile | null;
  email: string;
}>): ReactNode {
  const displayName = profile?.displayName ?? "Profile unavailable";

  return (
    <StatCard
      as="section"
      aria-label="Profile summary"
      padding="xs"
      hoverable={false}
      className="flex items-center gap-3.5 shadow-xs sm:gap-4"
    >
      <div className="relative shrink-0">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent font-mono text-base font-extrabold text-accent-foreground shadow-glow ring-2 ring-accent/30 sm:h-14 sm:w-14 sm:text-lg">
          {initials(profile?.displayName ?? "", email)}
        </span>
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface-elevated bg-income shadow-glow"
          title="Active Account"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-semibold text-foreground-muted">Signed in as</p>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">
            {displayName}
          </h2>
          <span className="inline-flex items-center rounded-md border border-income/30 bg-income/10 px-2 py-0.5 font-mono text-2xs font-bold text-income">
            Verified
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs font-medium text-foreground-muted">{email}</p>
        {profile === null ? (
          <p className="mt-1 text-xs text-foreground-muted">Profile details unavailable.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs font-semibold text-foreground-muted bg-surface-muted/80 px-2 py-0.5 rounded-md border border-border/60">
              Asia/Kolkata (IST)
            </span>
          </div>
        )}
      </div>
    </StatCard>
  );
}
