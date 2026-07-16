import type { ReactNode } from "react";

import { getSession } from "@/lib/api/session";

export default async function DashboardPage(): Promise<ReactNode> {
  const session = await getSession();
  const email = session?.user.email ?? "";

  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-xs tracking-widest text-foreground-muted uppercase">
          Signed in
        </p>
        <h1 className="mt-1 text-lg font-semibold text-foreground">{email}</h1>
      </div>

      <div className="relative overflow-hidden rounded-md border border-border bg-surface-muted p-6">
        <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" />
        <p className="font-mono text-xs tracking-widest text-foreground-muted uppercase">
          Ledger balance
        </p>
        <p className="mt-2 font-mono text-3xl font-semibold text-foreground">—</p>
        <p className="mt-3 text-sm text-foreground-muted">
          Balances post once accounts and transactions ship in Phase 2.
        </p>
      </div>
    </section>
  );
}
