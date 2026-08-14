"use client";

import { CreateAccountSchema, type AccountType } from "@treasury-ops/shared";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateAccount } from "@/features/accounts";
import { userErrorMessage } from "@/lib/errors";

export const ACCOUNT_TYPE_META: ReadonlyArray<
  Readonly<{ value: AccountType; label: string; icon: string }>
> = [
  { value: "bank", label: "Bank", icon: "🏦" },
  { value: "credit_card", label: "Card", icon: "💳" },
  { value: "cash", label: "Cash", icon: "💵" },
  { value: "wallet", label: "Wallet", icon: "👛" },
  { value: "investment", label: "Investment", icon: "📈" }
];

type CreateAccountSheetProps = Readonly<{
  open: boolean;
  initialType: AccountType;
  onClose: () => void;
}>;

export function CreateAccountSheet({
  open,
  initialType,
  onClose
}: CreateAccountSheetProps): ReactNode {
  const createAccount = useCreateAccount();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>(initialType);
  const [amountMinor, setAmountMinor] = useState(0);
  const [direction, setDirection] = useState<"available" | "owed">("available");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (open) {
      setName("");
      setType(initialType);
      setAmountMinor(0);
      setDirection("available");
      setError(undefined);
    }
  }, [open, initialType]);

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
      onClose();
    } catch (caught: unknown) {
      setError(userErrorMessage(caught, "Could not create this account."));
    }
  }

  if (!open) return null;

  return (
    <DialogSurface labelledBy="create-account-title" onClose={onClose} panelClassName="max-w-md">
      <h2 id="create-account-title" className="text-lg font-bold text-foreground">
        New account
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Name it and set what it holds today. The balance updates itself as you add transactions.
      </p>

      <form className="mt-6 space-y-5" onSubmit={submit}>
        <Input
          id="dashboard-account-name"
          name="name"
          autoComplete="off"
          label="Account name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. HDFC Savings…"
          maxLength={80}
          autoFocus
        />

        <div>
          <p className="font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Type
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ACCOUNT_TYPE_META.map((meta) => (
              <button
                key={meta.value}
                type="button"
                onClick={() => setType(meta.value)}
                className={`flex min-h-11 flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-2xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  type === meta.value
                    ? "border-accent bg-accent-glow text-accent"
                    : "border-border bg-surface text-foreground-muted"
                }`}
              >
                <span className="text-lg leading-none">{meta.icon}</span>
                <span>{meta.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <AmountInput
            id="dashboard-opening-balance"
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
                className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
        </div>

        {error === undefined ? null : (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" className="w-full sm:w-auto" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="w-full sm:w-auto" disabled={createAccount.isPending}>
            {createAccount.isPending ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>
    </DialogSurface>
  );
}
