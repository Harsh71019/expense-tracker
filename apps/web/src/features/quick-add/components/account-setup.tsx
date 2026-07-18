"use client";

import { AccountTypeSchema, CreateAccountSchema, type AccountType } from "@vyaya/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useCreateAccount } from "../hooks/use-create-account";

const accountTypes: readonly Readonly<{ value: AccountType; label: string }>[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank account" },
  { value: "credit_card", label: "Credit card" },
  { value: "wallet", label: "Wallet" },
  { value: "investment", label: "Investment" }
];

export function AccountSetup(): ReactNode {
  const createAccount = useCreateAccount();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("cash");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = CreateAccountSchema.safeParse({ name, type, openingBalanceMinor: 0 });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter an account name.");
      return;
    }
    setError(null);
    try {
      await createAccount.mutateAsync(parsed.data);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not create the account."
      );
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-6 sm:p-8">
      <p className="font-mono text-[10px] font-bold tracking-widest text-foreground-muted uppercase">
        First step
      </p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
        Create your first account
      </h1>
      <p className="mt-2 text-sm text-foreground-muted">
        Choose where this expense is coming from. You can add more accounts later.
      </p>
      <form className="mt-6 space-y-6 flex flex-col" onSubmit={submit}>
        <Input
          id="account-name"
          label="Account name"
          placeholder="Cash, HDFC, or UPI wallet"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
        <label className="flex flex-col gap-1.5 font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
          Account type
          <select
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            value={type}
            onChange={(event) => {
              const parsedType = AccountTypeSchema.safeParse(event.target.value);
              if (parsedType.success) {
                setType(parsedType.data);
              }
            }}
          >
            {accountTypes.map((accountType) => (
              <option key={accountType.value} value={accountType.value}>
                {accountType.label}
              </option>
            ))}
          </select>
        </label>
        {error === null ? null : (
          <p
            role="alert"
            className="rounded-lg border border-expense/25 bg-expense/10 px-3 py-1 font-mono text-[11px] font-semibold text-expense animate-fade-in self-start"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={createAccount.isPending} className="w-full py-3">
          {createAccount.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </section>
  );
}
