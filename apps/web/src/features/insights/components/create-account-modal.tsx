"use client";

import { CreateAccountSchema, type AccountType } from "@treasury-ops/shared";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateAccount } from "@/features/accounts";

export const ACCOUNT_TYPE_META: ReadonlyArray<
  Readonly<{ value: AccountType; label: string; icon: string }>
> = [
  { value: "bank", label: "Bank", icon: "🏦" },
  { value: "credit_card", label: "Card", icon: "💳" },
  { value: "cash", label: "Cash", icon: "💵" },
  { value: "wallet", label: "Wallet", icon: "👛" },
  { value: "investment", label: "Investment", icon: "📈" }
];

type CreateAccountModalProps = Readonly<{
  open: boolean;
  initialType: AccountType;
  onClose: () => void;
}>;

export function CreateAccountModal({
  open,
  initialType,
  onClose
}: CreateAccountModalProps): ReactNode {
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
      setError(caught instanceof Error ? caught.message : "Could not create this account.");
    }
  }

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
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
          Name it and set what it holds today. The balance updates itself as you add transactions.
        </p>

        <form className="mt-6 space-y-5" onSubmit={submit}>
          <Input
            id="dashboard-account-name"
            label="Account name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. HDFC Savings"
            maxLength={80}
            autoFocus
          />

          <div>
            <p className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              Type
            </p>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {ACCOUNT_TYPE_META.map((meta) => (
                <button
                  key={meta.value}
                  type="button"
                  onClick={() => setType(meta.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[10px] font-semibold transition-colors duration-150 ${
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
          </div>

          {error === undefined ? null : (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createAccount.isPending}>
              {createAccount.isPending ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
