import { formatMinor } from "@vyaya/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { getAccounts } from "@/features/accounts/server/get-accounts";
import { getSession } from "@/lib/api/session";

export default async function DashboardPage(): Promise<ReactNode> {
  const [session, accounts] = await Promise.all([getSession(), getAccounts()]);
  const email = session?.user.email ?? "";
  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const balanceMinor = activeAccounts.reduce((total, account) => total + account.balanceMinor, 0);
  const formattedBalance =
    balanceMinor < 0 ? `−${formatMinor(-balanceMinor)}` : formatMinor(balanceMinor);

  return (
    <section className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between animate-fade-in">
        <div>
          <p className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Overview
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-foreground">
            Good to see you.
          </h1>
        </div>
        <div className="self-start rounded-full border border-border bg-surface-muted/65 px-3 py-1 font-mono text-[11px] text-foreground-muted">
          {email}
        </div>
      </div>

      {/* Main Glass Balance Card */}
      <div className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface-elevated/80 to-surface-muted/40 p-6 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-accent/35 hover:shadow-glow sm:p-8 animate-fade-in">
        <span
          className="absolute inset-y-0 left-0 w-1 bg-accent rounded-full transition-all group-hover:w-1.5"
          aria-hidden="true"
        />
        <div
          className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-accent/8 blur-xl transition-all duration-500 group-hover:bg-accent/12 group-hover:scale-110"
          aria-hidden="true"
        />
        <p className="relative font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
          Ledger balance
        </p>
        <p className="relative mt-2.5 font-mono text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          {formattedBalance}
        </p>
        {activeAccounts.length === 0 ? (
          <p className="relative mt-3 text-sm text-foreground-muted">
            Start by creating an account, then add your first expense.
          </p>
        ) : (
          <p className="relative mt-3 text-sm text-foreground-muted">
            Across {activeAccounts.length} active{" "}
            {activeAccounts.length === 1 ? "account" : "accounts"}.
          </p>
        )}
      </div>

      {activeAccounts.length === 0 ? (
        <Link
          href="/add"
          className="self-start rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-sm shadow-accent/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-strong hover:shadow-md active:scale-98"
        >
          Create your first account
        </Link>
      ) : (
        <div className="space-y-4 animate-fade-in">
          <h2 className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Active Accounts
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeAccounts.map((account) => {
              const accountBalance =
                account.balanceMinor < 0
                  ? `−${formatMinor(-account.balanceMinor)}`
                  : formatMinor(account.balanceMinor);
              return (
                <div
                  key={account.id}
                  className="group relative overflow-hidden rounded-xl border border-border/75 bg-surface-elevated/30 p-4 transition-all duration-300 hover:bg-surface-elevated/70 hover:shadow-glow hover:border-accent/45 hover:-translate-y-0.5 active:scale-[0.98]"
                >
                  <span
                    className="absolute inset-y-0 left-0 w-1 bg-border/70 group-hover:bg-accent transition-colors"
                    aria-hidden="true"
                  />
                  <p className="pl-1 text-xs font-bold text-foreground-muted uppercase tracking-wider truncate">
                    {account.name}
                  </p>
                  <p className="pl-1 mt-2.5 font-mono text-base font-bold text-foreground">
                    {accountBalance}
                  </p>
                  <p className="pl-1 mt-0.5 font-mono text-[9px] font-bold text-foreground-muted tracking-wider uppercase">
                    available
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
