import Link from "next/link";
import type { ReactNode } from "react";

import { SignedMoney } from "@/components/ui/money";
import { getAccounts } from "@/features/accounts/server/get-accounts";
import { getSession } from "@/lib/api/session";

export default async function DashboardPage(): Promise<ReactNode> {
  const [session, accounts] = await Promise.all([getSession(), getAccounts()]);
  const email = session?.user.email ?? "";
  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const balanceMinor = activeAccounts.reduce((total, account) => total + account.balanceMinor, 0);

  return (
    <section className="flex max-w-2xl flex-col gap-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Overview</h1>
        <p className="truncate font-mono text-[11px] text-foreground-muted">{email}</p>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-surface-elevated p-6 sm:p-8">
        <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden="true" />
        <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-foreground-muted uppercase">
          Ledger balance
        </p>
        <div className="mt-2.5">
          <SignedMoney minor={balanceMinor} size="hero" />
        </div>
        {activeAccounts.length === 0 ? (
          <p className="mt-3 text-sm text-foreground-muted">
            Start by creating an account, then add your first expense.
          </p>
        ) : (
          <p className="mt-3 text-sm text-foreground-muted">
            Across {activeAccounts.length} active{" "}
            {activeAccounts.length === 1 ? "account" : "accounts"}.
          </p>
        )}
      </div>

      {activeAccounts.length === 0 ? (
        <Link
          href="/add"
          className="self-start rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-strong"
        >
          Create your first account
        </Link>
      ) : (
        <div className="space-y-3">
          <h2 className="font-mono text-[10px] font-bold tracking-[0.2em] text-foreground-muted uppercase">
            Active accounts
          </h2>
          <div className="overflow-hidden rounded-xl border border-border">
            {activeAccounts.map((account, index) => (
              <div
                key={account.id}
                className={`relative flex items-center justify-between gap-4 bg-surface-elevated px-4 py-3.5 ${
                  index > 0 ? "border-t border-border" : ""
                }`}
              >
                <span className="absolute inset-y-0 left-0 w-[3px] bg-border" aria-hidden="true" />
                <div className="min-w-0 pl-2">
                  <p className="truncate text-sm font-semibold text-foreground">{account.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] tracking-wider text-foreground-muted uppercase">
                    {account.type.replaceAll("_", " ")}
                  </p>
                </div>
                <SignedMoney minor={account.balanceMinor} size="lg" />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
