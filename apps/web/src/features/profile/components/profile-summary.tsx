import type { UserProfile } from "@treasury-ops/shared";
import { Clock, ShieldCheck, UserCheck } from "lucide-react";
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
  const displayName = profile?.displayName ?? (email ? email : "Profile unavailable");

  return (
    <article
      aria-label="Profile summary"
      className="glass-card relative overflow-hidden rounded-2xl p-4 sm:p-5 shadow-xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent font-mono text-lg font-black text-accent-foreground shadow-glow ring-2 ring-accent/30 sm:h-16 sm:w-16 sm:text-xl">
              {initials(profile?.displayName ?? "", email)}
            </span>
            <span
              className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-surface-elevated bg-income shadow-glow"
              title="Active Account"
            />
          </div>

          <div className="min-w-0 space-y-1">
            <p className="text-2xs font-semibold text-foreground-muted">Signed in as</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">
                {displayName}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-income/30 bg-income/10 px-2 py-0.5 font-mono text-2xs font-bold text-income">
                <UserCheck className="h-3 w-3" aria-hidden={true} />
                <span>Verified Operator</span>
              </span>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs font-medium text-foreground-muted">
              {email}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1.5 font-mono text-2xs">
          <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-surface-muted/80 px-2.5 py-1 font-semibold text-foreground">
            <Clock className="h-3 w-3 text-accent" aria-hidden={true} />
            <span>Asia/Kolkata (IST · UTC+5:30)</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface-muted/50 px-2 py-0.5 text-foreground-muted">
            <ShieldCheck className="h-3 w-3 text-income" aria-hidden={true} />
            <span>Double-Entry Ledger Verified</span>
          </span>
        </div>
      </div>
    </article>
  );
}
