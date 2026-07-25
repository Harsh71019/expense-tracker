"use client";

import { CreateTransactionSchema, type Account, type TransactionType } from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateTxn } from "@/features/quick-add";

type QuickAddPanelProps = Readonly<{ accounts: Account[] }>;

export function QuickAddPanel({ accounts }: QuickAddPanelProps): ReactNode {
  const create = useCreateTxn();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [type, setType] = useState<TransactionType>("expense");
  const [amountMinor, setAmountMinor] = useState(0);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();
  const [justAdded, setJustAdded] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (justAdded) return;
    const parsed = CreateTransactionSchema.safeParse({
      accountId,
      type,
      amountMinor,
      occurredAt: new Date(),
      description,
      tags: []
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the transaction details.");
      return;
    }
    setError(undefined);
    try {
      await create.mutateAsync({ ...parsed.data, idempotencyKey });
      toast.success("Added to your ledger");
      setAmountMinor(0);
      setDescription("");
      setJustAdded(true);
      setIdempotencyKey(crypto.randomUUID());
      setTimeout(() => setJustAdded(false), 1600);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not record this transaction.");
    }
  }

  const valid = amountMinor > 0 && description.trim() !== "" && accountId !== "";

  return (
    <div className="sticky top-10 rounded-2xl border border-border bg-surface-elevated p-6">
      <h2 className="text-lg font-bold tracking-tight text-foreground">Quick add</h2>
      <p className="mt-1 text-sm text-foreground-muted">Log a transaction in seconds.</p>

      <form className="mt-5 space-y-5" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-2">
          {(["expense", "income"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              onClick={() => setType(value)}
              className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                type === value
                  ? value === "income"
                    ? "border border-accent bg-accent-glow text-accent"
                    : "border border-border bg-surface-muted text-foreground"
                  : "border border-border text-foreground-muted"
              }`}
            >
              {value === "expense" ? "Expense" : "Income"}
            </button>
          ))}
        </div>

        <AmountInput
          id="quick-add-amount"
          label="Amount"
          value={amountMinor}
          onChange={setAmountMinor}
        />

        <label className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
          Account
          <select
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <Input
          id="quick-add-description"
          label="Description"
          placeholder="e.g. Coffee"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
        />

        {error === undefined ? null : (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full py-3"
          disabled={create.isPending || (!valid && !justAdded)}
        >
          {justAdded ? "✓ Added" : create.isPending ? "Adding…" : "Add transaction"}
        </Button>
        <p className="text-center font-mono text-[10px] text-foreground-muted">
          Safe to tap once — duplicate submits are ignored this session.
        </p>
      </form>
    </div>
  );
}
