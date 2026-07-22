"use client";

import { CreateAccountSchema, type Account, type AccountType } from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Money, SignedMoney } from "@/components/ui/money";

import { useAccounts } from "../hooks/use-accounts";
import { useArchiveAccount } from "../hooks/use-archive-account";
import { useCreateAccount } from "../hooks/use-create-account";

type TypeMeta = { value: AccountType; label: string; filterLabel: string; icon: string };

const accountTypes: readonly TypeMeta[] = [
  { value: "bank", label: "Bank", filterLabel: "Bank", icon: "🏦" },
  { value: "credit_card", label: "Credit card", filterLabel: "Cards", icon: "💳" },
  { value: "cash", label: "Cash", filterLabel: "Cash", icon: "💵" },
  { value: "wallet", label: "Wallet", filterLabel: "Wallets", icon: "👛" },
  { value: "investment", label: "Investment", filterLabel: "Investments", icon: "📈" }
];

function typeMeta(type: AccountType): TypeMeta {
  const meta = accountTypes.find((entry) => entry.value === type);
  if (meta === undefined) throw new Error(`Unknown account type: ${type}`);
  return meta;
}

type Filter = "all" | AccountType;

const pillClasses = (active: boolean): string =>
  [
    "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-150",
    active
      ? "border border-accent bg-accent-glow text-accent"
      : "border border-transparent text-foreground-muted hover:text-foreground"
  ].join(" ");

export function AccountManager({ initialAccounts }: { initialAccounts: Account[] }): ReactNode {
  const accounts = useAccounts(initialAccounts);
  const createAccount = useCreateAccount();
  const archiveAccount = useArchiveAccount();
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [amountMinor, setAmountMinor] = useState(0);
  const [direction, setDirection] = useState<"available" | "owed">("available");
  const [confirming, setConfirming] = useState<Account>();
  const [error, setError] = useState<string>();

  function openCreate(): void {
    setName("");
    setAmountMinor(0);
    setDirection("available");
    setType("bank");
    setError(undefined);
    setCreateOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = CreateAccountSchema.safeParse({
      name,
      type,
      openingBalanceMinor: direction === "owed" ? -amountMinor : amountMinor
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the account details.");
      return;
    }
    try {
      await createAccount.mutateAsync(parsed.data);
      setCreateOpen(false);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not create this account.");
    }
  }

  async function archive(): Promise<void> {
    if (confirming === undefined) return;
    try {
      await archiveAccount.mutateAsync(confirming.id);
      setConfirming(undefined);
      setError(undefined);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not archive this account.");
    }
  }

  const items = accounts.data ?? initialAccounts;
  const active = items.filter((account) => !account.isArchived);
  const hasArchived = items.some((account) => account.isArchived);
  const assetsTotal = active
    .filter((account) => account.balanceMinor >= 0)
    .reduce((sum, account) => sum + account.balanceMinor, 0);
  const liabilitiesTotal = active
    .filter((account) => account.balanceMinor < 0)
    .reduce((sum, account) => sum + account.balanceMinor, 0);
  const netWorth = active.reduce((sum, account) => sum + account.balanceMinor, 0);

  let visible = showArchived ? items : active;
  if (filter !== "all") visible = visible.filter((account) => account.type === filter);

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
            Expense tracker
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Accounts
          </h1>
          <p className="mt-2 max-w-md text-sm text-foreground-muted">
            The containers your money lives in. Balances update automatically as transactions post.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <span className="mr-1 text-base leading-none">+</span> New account
        </Button>
      </header>

      {items.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-10 rounded-2xl border border-border bg-surface-elevated p-6 sm:p-7">
          <div className="min-w-[200px]">
            <p className="font-mono text-[10px] font-bold tracking-[0.15em] text-foreground-muted uppercase">
              Net worth
            </p>
            <div className="mt-1.5">
              <SignedMoney minor={netWorth} size="hero" />
            </div>
            <p className="mt-2 text-sm text-foreground-muted">
              across {active.length} active {active.length === 1 ? "account" : "accounts"}
            </p>
          </div>
          <div className="hidden h-14 w-px self-stretch bg-border sm:block" aria-hidden="true" />
          <div className="flex flex-wrap gap-10">
            <div>
              <p className="font-mono text-[10px] font-bold tracking-[0.15em] text-foreground-muted uppercase">
                Assets
              </p>
              <div className="mt-1.5">
                <Money minor={assetsTotal} size="lg" />
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold tracking-[0.15em] text-foreground-muted uppercase">
                Liabilities
              </p>
              <div className="mt-1.5">
                <Money
                  minor={Math.abs(liabilitiesTotal)}
                  variant={liabilitiesTotal < 0 ? "expense" : "neutral"}
                  size="lg"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={pillClasses(filter === "all")}
          >
            All
          </button>
          {accountTypes.map((meta) => (
            <button
              key={meta.value}
              type="button"
              onClick={() => setFilter(meta.value)}
              className={pillClasses(filter === meta.value)}
            >
              {meta.filterLabel}
            </button>
          ))}
          <div className="flex-1" />
          {hasArchived ? (
            <label className="flex items-center gap-2 text-sm text-foreground-muted select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              Show archived
            </label>
          ) : null}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Accounts are where every transaction, transfer, and import lands. Create your first one to start tracking."
          action={
            <Button type="button" onClick={openCreate}>
              <span className="mr-1 text-base leading-none">+</span> Create account
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState title="No matching accounts" description="Try a different filter." />
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {visible.map((account) => {
            const meta = typeMeta(account.type);
            return (
              <article
                key={account.id}
                className={`rounded-2xl border border-border bg-surface-elevated p-5 ${
                  account.isArchived ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted text-xl">
                      {meta.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">
                        {account.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] tracking-wider text-foreground-muted uppercase">
                        {meta.label}
                      </p>
                    </div>
                  </div>
                  {account.isArchived ? (
                    <span className="shrink-0 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-foreground-muted">
                      ARCHIVED
                    </span>
                  ) : null}
                </div>

                <p className="mt-5 font-mono text-[10px] font-bold tracking-[0.15em] text-foreground-muted uppercase">
                  Balance
                </p>
                <div className="mt-1">
                  <SignedMoney minor={account.balanceMinor} size="lg" />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5">
                  <span className="font-mono text-[11px] text-foreground-muted">
                    Opening <SignedMoney minor={account.openingBalanceMinor} size="sm" />
                  </span>
                  {account.isArchived ? null : (
                    <button
                      type="button"
                      onClick={() => setConfirming(account)}
                      className="text-xs font-medium text-foreground-muted hover:text-foreground"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {createOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm animate-fade-in"
          onClick={() => setCreateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-account-title"
            className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-6 shadow-glow-strong animate-scale-up sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="create-account-title" className="text-lg font-bold text-foreground">
              New account
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Name, type, and opening balance are set once and can&apos;t be changed later.
            </p>

            <form className="mt-6 space-y-5" onSubmit={submit}>
              <Input
                id="account-name"
                label="Account name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. HDFC Savings"
                maxLength={80}
              />

              <div>
                <p className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
                  Type
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {accountTypes.map((meta) => (
                    <button
                      key={meta.value}
                      type="button"
                      onClick={() => setType(meta.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-semibold transition-colors duration-150 ${
                        type === meta.value
                          ? "border-accent bg-accent-glow text-accent"
                          : "border-border bg-surface text-foreground-muted"
                      }`}
                    >
                      <span className="text-lg leading-none">{meta.icon}</span>
                      <span>{meta.filterLabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <AmountInput
                  id="opening-balance"
                  label="Opening balance"
                  value={amountMinor}
                  onChange={setAmountMinor}
                />
                <div className="mt-3 flex justify-center gap-2">
                  {(["available", "owed"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDirection(value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                        direction === value
                          ? value === "owed"
                            ? "border border-expense/40 bg-expense/10 text-expense"
                            : "border border-accent bg-accent-glow text-accent"
                          : "border border-border text-foreground-muted"
                      }`}
                    >
                      {value === "available" ? "+ Available" : "− Owed"}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-center text-xs text-foreground-muted">
                  Use owed for accounts that start in debt, like a credit card.
                </p>
              </div>

              {error === undefined ? null : (
                <p role="alert" className="text-sm text-expense">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createAccount.isPending}>
                  {createAccount.isPending ? "Creating…" : "Create account"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirming === undefined ? null : (
        <div
          role="presentation"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm animate-fade-in"
          onClick={() => setConfirming(undefined)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-account-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-elevated p-6 shadow-glow-strong animate-scale-up sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="archive-account-title" className="text-lg font-bold text-foreground">
              Archive {confirming.name}?
            </h2>
            <p className="mt-2 text-sm text-foreground-muted">
              It drops out of active lists and totals, but its transaction history stays intact.
              This can&apos;t be undone — archiving is one-way.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirming(undefined)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void archive()}
                disabled={archiveAccount.isPending}
                className="bg-expense text-white hover:bg-expense/90"
              >
                {archiveAccount.isPending ? "Archiving…" : "Archive account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
