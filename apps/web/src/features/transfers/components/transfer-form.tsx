"use client";

import { CreateTransferSchema } from "@vyaya/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/features/accounts";

import { useCreateTransfer } from "../hooks/use-transfers";

function todayInput(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function TransferForm(): ReactNode {
  const router = useRouter();
  const accounts = useAccounts();
  const transfer = useCreateTransfer();
  const [amountMinor, setAmountMinor] = useState(0);
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayInput);
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string>();
  const items = accounts.data ?? [];

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = CreateTransferSchema.safeParse({
      amountMinor,
      fromAccountId,
      toAccountId,
      occurredAt: `${date}T12:00:00.000+05:30`,
      description,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "")
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the transfer details.");
      return;
    }
    try {
      await transfer.mutateAsync(parsed.data);
      setError(undefined);
      router.push("/transactions");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not record this transfer.");
    }
  }

  if (accounts.isLoading) return <p className="text-sm text-foreground-muted">Loading accounts…</p>;
  if (items.length < 2)
    return (
      <EmptyState
        title="Two accounts are required"
        description="Create another active account before recording a transfer."
        action={
          <Link href="/accounts" className="font-semibold text-accent">
            Manage accounts
          </Link>
        }
      />
    );

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="font-mono text-[10px] font-bold tracking-widest text-foreground-muted uppercase">
          Move money
        </p>
        <h1 className="mt-1 text-3xl font-extrabold">Transfer between accounts</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Vyaya records two linked ledger legs atomically; it does not initiate a bank transfer.
        </p>
      </header>
      <form
        className="space-y-5 rounded-2xl border border-border bg-surface-elevated p-5 sm:p-7"
        onSubmit={submit}
      >
        <AmountInput
          id="transfer-amount"
          label="Amount"
          value={amountMinor}
          onChange={setAmountMinor}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold">
            From
            <select
              className="min-h-11 rounded-xl border border-border bg-surface px-3"
              value={fromAccountId}
              onChange={(event) => {
                setFromAccountId(event.target.value);
                if (event.target.value === toAccountId) setToAccountId("");
              }}
            >
              <option value="">Select source</option>
              {items.map((item) => (
                <option key={item.id} value={item.id} disabled={item.id === toAccountId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold">
            To
            <select
              className="min-h-11 rounded-xl border border-border bg-surface px-3"
              value={toAccountId}
              onChange={(event) => setToAccountId(event.target.value)}
            >
              <option value="">Select destination</option>
              {items.map((item) => (
                <option key={item.id} value={item.id} disabled={item.id === fromAccountId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input
          id="transfer-description"
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="transfer-date"
            label="Date (Asia/Kolkata)"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <Input
            id="transfer-tags"
            label="Tags (comma separated)"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </div>
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
        <Button type="submit" disabled={transfer.isPending}>
          {transfer.isPending ? "Recording transfer…" : "Record transfer"}
        </Button>
      </form>
    </section>
  );
}
