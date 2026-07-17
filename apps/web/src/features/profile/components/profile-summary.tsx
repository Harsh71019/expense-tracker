import type { UserProfile } from "@vyaya/shared";
import type { ReactNode } from "react";

export function ProfileSummary({
  profile,
  email
}: {
  profile: UserProfile | null;
  email: string;
}): ReactNode {
  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-5">
      <p className="font-mono text-[10px] font-bold tracking-widest text-foreground-muted uppercase">
        Profile
      </p>
      {profile === null ? (
        <div className="mt-3">
          <h2 className="font-bold">Profile unavailable</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Your app profile could not be loaded. Other settings remain available.
          </p>
          <p className="mt-3 truncate text-sm">{email}</p>
        </div>
      ) : (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-foreground-muted">Display name</dt>
            <dd className="mt-1 font-semibold">{profile.displayName}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Signed-in email</dt>
            <dd className="mt-1 truncate font-semibold">{email}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Locale</dt>
            <dd className="mt-1 font-semibold">English (India)</dd>
            <dd className="font-mono text-xs text-foreground-muted">{profile.locale}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Timezone</dt>
            <dd className="mt-1 font-semibold">India Standard Time</dd>
            <dd className="font-mono text-xs text-foreground-muted">{profile.timezone}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
