import type { ReactNode } from "react";

import { SignOutButton } from "@/features/auth";
import { getSession } from "@/lib/api/session";

export default async function MorePage(): Promise<ReactNode> {
  const session = await getSession();

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">Account</h1>

      <div className="rounded-md border border-border bg-surface-muted p-4">
        <p className="font-mono text-xs tracking-widest text-foreground-muted uppercase">
          Signed in as
        </p>
        <p className="mt-1 truncate text-sm text-foreground">{session?.user.email}</p>
      </div>

      <div className="md:hidden">
        <SignOutButton />
      </div>
    </section>
  );
}
