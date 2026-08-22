"use client";

import type {
  Account,
  AccountInsights,
  AccountInsightsRange,
  AccountType,
  Category,
  TransactionPage
} from "@treasury-ops/shared";
import { ArrowDownLeft, ArrowUpRight, Hash, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Money, SignedMoney } from "@/components/ui/money";
import { CreateTxnSheet } from "@/features/transactions";
import { toast } from "@/lib/toast";

import { AccountBalanceChart } from "./account-balance-chart";
import { AccountCashflowChart } from "./account-cashflow-chart";
import { AccountSpendingBreakdown } from "./account-spending-breakdown";
import { AccountTransactionLedger } from "./account-transaction-ledger";

const typeMeta: Record<AccountType, Readonly<{ label: string; icon: string }>> = {
  bank: { label: "Bank account", icon: "🏦" },
  credit_card: { label: "Credit card", icon: "💳" },
  cash: { label: "Cash", icon: "💵" },
  wallet: { label: "Wallet", icon: "👛" },
  investment: { label: "Investment account", icon: "📈" }
};

const ranges: readonly Readonly<{ value: AccountInsightsRange; label: string }>[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
  { value: "all", label: "All time" }
];

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type AccountDetailProps = Readonly<{
  account: Account;
  insights: AccountInsights;
  initialTransactions: TransactionPage;
  initialAccounts: Account[];
  initialCategories: Category[];
}>;

export function AccountDetail({
  account,
  insights,
  initialTransactions,
  initialAccounts,
  initialCategories
}: AccountDetailProps): ReactNode {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const meta = typeMeta[account.type];

  async function copyAccountId(): Promise<void> {
    try {
      await navigator.clipboard.writeText(account.id);
      toast.success("Account ID copied");
    } catch {
      toast.error("Could not copy this account ID");
    }
  }

  function closeCreate(): void {
    setCreateOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-7 pb-12 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs items={[{ label: "Accounts", href: "/accounts" }, { label: account.name }]} />
        <Link
          href="/accounts"
          className="hidden min-h-11 items-center rounded-lg px-3 text-xs font-semibold text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:inline-flex"
        >
          ← Back to all accounts
        </Link>
      </div>

      <header className="relative overflow-hidden rounded-3xl border border-border bg-surface-elevated shadow-sm">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-accent/20 bg-accent-glow text-2xl shadow-xs"
              aria-hidden="true"
            >
              {meta.icon}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {account.name}
                </h1>
                <span className="rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                  {meta.label}
                </span>
                {account.isArchived ? (
                  <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-2xs font-bold tracking-wider text-warning uppercase">
                    Archived
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-foreground-muted">
                Opened {dateFormatter.format(account.createdAt)} · {account.currency}
              </p>
            </div>
          </div>

          {account.isArchived ? null : (
            <Button type="button" onClick={() => setCreateOpen(true)} className="w-full lg:w-auto">
              <Plus size={16} className="mr-1.5 inline" /> Add transaction
            </Button>
          )}
        </div>

        <div className="grid gap-5 border-t border-border bg-surface-muted/35 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-7">
          <div>
            <p className="font-mono text-2xs font-bold tracking-[0.2em] text-foreground-muted uppercase">
              Current balance
            </p>
            <div className="mt-2">
              <SignedMoney minor={account.balanceMinor} size="hero" />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:text-right">
            <div>
              <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                Opening
              </dt>
              <dd className="mt-1">
                <SignedMoney minor={account.openingBalanceMinor} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                Updated
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">
                {dateFormatter.format(account.updatedAt)}
              </dd>
            </div>
            {account.creditCardConfig === undefined ? null : (
              <>
                <div>
                  <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                    Statement day
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    {account.creditCardConfig.statementDay}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
                    Next statement
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-foreground">
                    {dateFormatter.format(account.creditCardConfig.nextStatementAt)}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </header>

      <section aria-labelledby="account-range-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
              Account movement
            </p>
            <h2 id="account-range-heading" className="mt-1 text-xl font-bold text-foreground">
              Statement analysis
            </h2>
          </div>
          <nav
            aria-label="Account insight range"
            className="grid grid-cols-4 rounded-xl border border-border bg-surface-muted p-1"
          >
            {ranges.map((range) => {
              const active = insights.range === range.value;
              return (
                <Link
                  key={range.value}
                  href={`/accounts/${account.id}?range=${range.value}`}
                  aria-current={active ? "page" : undefined}
                  className={`grid min-h-11 place-items-center rounded-lg px-2 text-center text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? "bg-surface-elevated text-accent shadow-xs"
                      : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {range.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-income/20 bg-income/5 p-4 sm:p-5">
            <p className="flex items-center gap-1.5 font-mono text-2xs font-bold tracking-wider text-income uppercase">
              <ArrowDownLeft size={14} /> Money in
            </p>
            <div className="mt-2">
              <Money minor={insights.summary.incomeMinor} variant="income" signed size="lg" />
            </div>
          </div>
          <div className="rounded-2xl border border-expense/20 bg-expense/5 p-4 sm:p-5">
            <p className="flex items-center gap-1.5 font-mono text-2xs font-bold tracking-wider text-expense uppercase">
              <ArrowUpRight size={14} /> Money out
            </p>
            <div className="mt-2">
              <Money minor={insights.summary.expenseMinor} variant="expense" signed size="lg" />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Net movement
            </p>
            <div className="mt-2">
              <SignedMoney minor={insights.summary.netMinor} size="lg" />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
            <p className="flex items-center gap-1.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              <Hash size={13} /> Ledger entries
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {insights.summary.transactionCount}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.8fr)]">
        <section
          aria-labelledby="balance-trace-title"
          className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-xs sm:p-5"
        >
          <div className="mb-4">
            <p className="font-mono text-2xs font-bold tracking-wider text-accent uppercase">
              Balance trace
            </p>
            <h2 id="balance-trace-title" className="mt-1 text-base font-bold text-foreground">
              Running balance
            </h2>
          </div>
          <AccountBalanceChart points={insights.balanceSeries} />
        </section>

        <section
          aria-labelledby="spending-mix-title"
          className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-xs"
        >
          <p className="font-mono text-2xs font-bold tracking-wider text-accent uppercase">
            Consumption
          </p>
          <h2 id="spending-mix-title" className="mt-1 text-base font-bold text-foreground">
            Spending mix
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            Transfers, reversals, and asset funding are excluded.
          </p>
          <div className="mt-5">
            <AccountSpendingBreakdown items={insights.spendingByCategory} />
          </div>
        </section>
      </div>

      <section
        aria-labelledby="cash-movement-title"
        className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-xs sm:p-5"
      >
        <p className="font-mono text-2xs font-bold tracking-wider text-accent uppercase">
          Physical movement
        </p>
        <h2 id="cash-movement-title" className="mt-1 text-base font-bold text-foreground">
          Money in versus money out
        </h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Reversal entries remain visible so net movement reconciles with the ledger.
        </p>
        <div className="mt-4">
          <AccountCashflowChart points={insights.cashflowSeries} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
              Account ID
            </p>
            <code className="mt-1 block max-w-full overflow-hidden text-ellipsis font-mono text-xs text-foreground">
              {account.id}
            </code>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void copyAccountId()}>
            Copy ID
          </Button>
        </div>
      </section>

      <AccountTransactionLedger
        account={account}
        initialPage={initialTransactions}
        initialAccounts={initialAccounts}
        initialCategories={initialCategories}
      />

      {createOpen ? <CreateTxnSheet onClose={closeCreate} initialAccountId={account.id} /> : null}
    </div>
  );
}
