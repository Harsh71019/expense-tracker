import type { UserProfile } from "@treasury-ops/shared";
import type { ReactNode } from "react";

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
    <section
      aria-label="Profile summary"
      className="glass-card flex items-center gap-4 rounded-2xl p-5 shadow-sm sm:gap-5 sm:p-6"
    >
      <div className="relative shrink-0">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent font-mono text-lg font-extrabold text-accent-foreground shadow-glow ring-2 ring-accent/30 sm:h-16 sm:w-16 sm:text-xl">
          {initials(profile?.displayName ?? "", email)}
        </span>
        <span
          className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-surface-elevated bg-income shadow-glow"
          title="Active Account"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">
            {displayName}
          </h2>
          <span className="inline-flex items-center rounded-full border border-income/30 bg-income/10 px-2 py-0.5 font-mono text-[10px] font-bold text-income">
            Verified
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground-muted">{email}</p>
        {profile === null ? (
          <p className="mt-2 text-xs text-foreground-muted">
            Your profile details could not be loaded. Other settings remain available.
          </p>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-medium text-foreground-muted bg-surface-muted/80 px-2.5 py-0.5 rounded-md border border-border/60">
              English (India) · Asia/Kolkata (IST)
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
