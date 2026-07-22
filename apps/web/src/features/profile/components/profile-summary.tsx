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
      className="flex items-center gap-4 rounded-2xl border border-border bg-surface-elevated p-5 sm:gap-5 sm:px-6"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent font-mono text-lg font-bold text-accent-foreground shadow-glow sm:h-15 sm:w-15">
        {initials(profile?.displayName ?? "", email)}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">
          {displayName}
        </h2>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground-muted">{email}</p>
        {profile === null ? (
          <p className="mt-2 text-xs text-foreground-muted">
            Your profile details could not be loaded. Other settings remain available.
          </p>
        ) : (
          <p className="mt-2 font-mono text-[11px] font-medium text-foreground-muted">
            English (India) · Asia/Kolkata (IST)
          </p>
        )}
      </div>
    </section>
  );
}
