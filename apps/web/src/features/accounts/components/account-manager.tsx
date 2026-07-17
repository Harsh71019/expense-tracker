"use client";

import {
  AccountTypeSchema,
  CreateAccountSchema,
  type Account,
  type AccountType
} from "@vyaya/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SignedMoney } from "@/components/ui/money";

import { useAccounts } from "../hooks/use-accounts";
import { useArchiveAccount } from "../hooks/use-archive-account";
import { useCreateAccount } from "../hooks/use-create-account";

const accountTypes: readonly Readonly<{ value: AccountType; label: string }>[] = [
  { value: "bank", label: "Bank account" },
  { value: "credit_card", label: "Credit card" },
  { value: "cash", label: "Cash" },
  { value: "wallet", label: "Wallet" },
  { value: "investment", label: "Investment" }
];

export function AccountManager({ initialAccounts }: { initialAccounts: Account[] }): ReactNode {
  const accounts = useAccounts(initialAccounts);
  const createAccount = useCreateAccount();
  const archiveAccount = useArchiveAccount();
  const [showForm, setShowForm] = useState(initialAccounts.length === 0);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("bank");
  const [amountMinor, setAmountMinor] = useState(0);
  const [direction, setDirection] = useState<"available" | "owed">("available");
  const [confirming, setConfirming] = useState<Account>();
  const [error, setError] = useState<string>();

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
      setName("");
      setAmountMinor(0);
      setDirection("available");
      setShowForm(false);
      setError(undefined);
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
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-widest text-foreground-muted uppercase">
            Settings
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Accounts</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Balances remain ledger-derived; archiving never removes history.
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? "Close form" : "Add account"}
        </Button>
      </header>

      {showForm ? (
        <form
          className="space-y-5 rounded-2xl border border-border bg-surface-elevated p-5 sm:p-7"
          onSubmit={submit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="account-name"
              label="Account name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <label className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              Account type
              <select
                className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm"
                value={type}
                onChange={(event) => {
                  const parsed = AccountTypeSchema.safeParse(event.target.value);
                  if (parsed.success) setType(parsed.data);
                }}
              >
                {accountTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <AmountInput
            id="opening-balance"
            label="Opening balance"
            value={amountMinor}
            onChange={setAmountMinor}
          />
          <fieldset className="flex gap-3">
            <legend className="mb-2 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              Balance direction
            </legend>
            {(["available", "owed"] as const).map((value) => (
              <label
                key={value}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm"
              >
                <input
                  type="radio"
                  checked={direction === value}
                  onChange={() => setDirection(value)}
                />
                {value === "available" ? "Available / positive" : "Owed / negative"}
              </label>
            ))}
          </fieldset>
          {error === undefined ? null : (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
          <Button type="submit" disabled={createAccount.isPending}>
            {createAccount.isPending ? "Creating…" : "Create account"}
          </Button>
        </form>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="No active accounts"
          description="Create an account to start recording your ledger."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((account) => (
            <article
              key={account.id}
              className="rounded-2xl border border-border bg-surface-elevated p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{account.name}</h2>
                  <p className="mt-1 text-xs uppercase tracking-wider text-foreground-muted">
                    {account.type.replaceAll("_", " ")}
                  </p>
                </div>
                <SignedMoney minor={account.balanceMinor} className="text-lg" />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="mt-5"
                onClick={() => setConfirming(account)}
              >
                Archive
              </Button>
            </article>
          ))}
        </div>
      )}

      {confirming === undefined ? null : (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-account-title"
          className="rounded-2xl border border-expense/30 bg-surface-elevated p-5 shadow-lg"
        >
          <h2 id="archive-account-title" className="text-lg font-bold">
            Archive {confirming.name}?
          </h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Existing transactions and the current balance remain in the ledger. This account will
            disappear from future selectors.
          </p>
          <div className="mt-3">
            <SignedMoney minor={confirming.balanceMinor} />
          </div>
          <div className="mt-5 flex gap-3">
            <Button
              type="button"
              onClick={() => void archive()}
              disabled={archiveAccount.isPending}
            >
              {archiveAccount.isPending ? "Archiving…" : "Archive account"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(undefined)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}
