"use client";

import type { AccountType } from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCreateAccount } from "@/features/accounts";
import { userErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

import { parseAccountSetupInput, parseAccountType } from "../model/account-setup-form";

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
    const parsed = parseAccountSetupInput({ name, type });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter an account name.");
      return;
    }
    setError(null);
    try {
      await createAccount.mutateAsync(parsed.data);
      toast.success("Account created");
    } catch (requestError: unknown) {
      const message = userErrorMessage(requestError, "Could not create the account.");
      setError(message);
      toast.error(message);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-6 sm:p-8">
      <p className="font-mono text-2xs font-bold tracking-widest text-foreground-muted uppercase">
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
        <div className="flex flex-col gap-1.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
          <span>Account type</span>
          <Select
            name="type"
            aria-label="Account type"
            options={accountTypes}
            value={type}
            onChange={(val) => {
              const parsedType = parseAccountType(val);
              if (parsedType.success) {
                setType(parsedType.data);
              }
            }}
          />
        </div>
        {error === null ? null : (
          <p
            role="alert"
            className="rounded-lg border border-expense/25 bg-expense/10 px-3 py-1 font-mono text-2xs font-semibold text-expense animate-fade-in self-start"
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
