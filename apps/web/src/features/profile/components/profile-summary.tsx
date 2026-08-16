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
  email,
  action
}: Readonly<{
  profile: UserProfile | null;
  email: string;
  action?: ReactNode;
}>): ReactNode {
  const displayName = profile?.displayName ?? (email ? email : "Profile unavailable");

  return (
    <article
      aria-label="Profile summary"
      className="glass-card flex h-full flex-col justify-between gap-5 rounded-2xl p-4 shadow-xs sm:p-5"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent font-mono text-lg font-black text-accent-foreground sm:h-16 sm:w-16 sm:text-xl"
        >
          {initials(profile?.displayName ?? "", email)}
        </span>

        <div className="min-w-0">
          <h2 className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">
            {displayName}
          </h2>
          <p className="mt-0.5 truncate text-sm text-foreground-muted">{email}</p>
        </div>
      </div>

      {action === undefined ? null : <div className="border-t border-border/60 pt-4">{action}</div>}
    </article>
  );
}
