import type { ReactNode } from "react";

import { getSession } from "@/lib/api/session";

export default async function DashboardPage(): Promise<ReactNode> {
  const session = await getSession();

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">
        {session === null ? "Welcome" : `Welcome, ${session.user.email}`}
      </h1>
      <p className="text-foreground-muted">
        Your ledger dashboard lands here once Phase 2 (accounts, transactions, balances) ships.
      </p>
    </section>
  );
}
