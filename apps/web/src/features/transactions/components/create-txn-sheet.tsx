"use client";

import { CreateTransactionSchema, parseMinor, type CreateTransaction } from "@vyaya/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";
import { useCreateTxn } from "@/features/quick-add";
import { ValidationError } from "@/lib/errors";

const selectClasses =
  "w-full rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function fieldErrorName(path: string): keyof CreateTransaction | null {
  if (
    path === "accountId" ||
    path === "categoryId" ||
    path === "type" ||
    path === "amountMinor" ||
    path === "occurredAt" ||
    path === "description" ||
    path === "tags"
  ) {
    return path;
  }
  return null;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreateTxnSheet({ onClose }: Readonly<{ onClose: () => void }>): ReactNode {
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const accounts = useAccounts();
  const categories = useCategories();
  const create = useCreateTxn();
  const [amountDraft, setAmountDraft] = useState("");
  const form = useForm<CreateTransaction>({
    defaultValues: {
      type: "expense",
      amountMinor: 0,
      occurredAt: new Date(`${todayInputValue()}T00:00:00.000Z`),
      description: "",
      tags: []
    }
  });
  const type = form.watch("type");
  const matchingCategories = (categories.data ?? []).filter(
    (category) => category.kind === type && !category.isArchived
  );
  const activeAccounts = (accounts.data ?? []).filter((account) => !account.isArchived);

  async function submit(values: CreateTransaction): Promise<void> {
    const parsed = CreateTransactionSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const name = fieldErrorName(issue.path.join("."));
        if (name !== null) form.setError(name, { message: issue.message });
      }
      return;
    }
    try {
      await create.mutateAsync({ ...parsed.data, idempotencyKey });
      toast.success("Transaction posted to the ledger");
      setIdempotencyKey(crypto.randomUUID());
      onClose();
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        for (const field of error.fields) {
          const name = fieldErrorName(field.path);
          if (name !== null) form.setError(name, { message: field.message });
        }
      } else {
        toast.error("Could not post this entry");
      }
    }
  }

  const canSubmit = form.watch("amountMinor") > 0 && form.watch("description").trim().length > 0;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-txn-title"
        className="h-screen w-full max-w-md overflow-y-auto border-l border-border bg-surface-elevated p-7 animate-drawer-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="create-txn-title" className="text-xl font-bold tracking-tight text-foreground">
            New entry
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-foreground-muted">
          Amount, type, account, and date are permanent once posted. Corrections happen by reversal.
        </p>

        <form onSubmit={form.handleSubmit(submit)} className="mt-6 space-y-5">
          <div
            className="relative grid grid-cols-2 rounded-lg bg-surface-muted p-1 border border-border/50"
            aria-label="Transaction type"
          >
            <div
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md bg-surface-elevated border border-border transition-transform duration-200 ease-out ${
                type === "expense" ? "translate-x-1" : "translate-x-[calc(100%+3px)]"
              }`}
              aria-hidden="true"
            />
            {(["expense", "income"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                className={`relative z-10 flex items-center justify-center rounded-lg py-2.5 text-sm font-semibold transition-colors focus:outline-none ${
                  type === value ? "text-accent" : "text-foreground-muted hover:text-foreground"
                }`}
                onClick={() => form.setValue("type", value, { shouldValidate: true })}
              >
                {value === "expense" ? "Expense" : "Income"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="create-txn-amount"
              className="font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
            >
              Amount
            </label>
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-muted px-3.5">
              <span
                aria-hidden="true"
                className={`font-mono text-lg font-semibold ${type === "income" ? "text-income" : "text-foreground-muted"}`}
              >
                {type === "income" ? "+" : "−"}
              </span>
              <span aria-hidden="true" className="font-mono text-base text-foreground-muted">
                ₹
              </span>
              <input
                id="create-txn-amount"
                value={amountDraft}
                onChange={(event) => setAmountDraft(event.target.value.replace(/[^0-9.]/g, ""))}
                onBlur={() => {
                  try {
                    form.setValue("amountMinor", amountDraft === "" ? 0 : parseMinor(amountDraft), {
                      shouldValidate: true
                    });
                  } catch {
                    form.setValue("amountMinor", 0, { shouldValidate: true });
                  }
                }}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full bg-transparent py-3.5 font-mono text-lg font-semibold text-foreground normal-case tracking-normal outline-none"
              />
            </div>
            {form.formState.errors.amountMinor?.message === undefined ? null : (
              <span className="self-start rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 font-mono text-[10px] text-expense">
                {form.formState.errors.amountMinor.message}
              </span>
            )}
          </div>

          <label className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            Account
            <select className={selectClasses} {...form.register("accountId")}>
              <option value="">Choose account</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            {form.formState.errors.accountId?.message === undefined ? null : (
              <span className="rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 self-start font-mono text-[10px] normal-case text-expense">
                {form.formState.errors.accountId.message}
              </span>
            )}
          </label>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              Date
              <input
                type="date"
                className={selectClasses}
                value={form.watch("occurredAt").toISOString().slice(0, 10)}
                onChange={(event) =>
                  form.setValue("occurredAt", new Date(`${event.target.value}T00:00:00.000Z`), {
                    shouldValidate: true
                  })
                }
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
              Category
              <select className={selectClasses} {...form.register("categoryId")}>
                <option value="">Uncategorized</option>
                {matchingCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col">
            <Input
              id="create-txn-description"
              label="Description"
              placeholder="e.g. Dinner at Toit"
              maxLength={500}
              {...form.register("description")}
            />
            {form.formState.errors.description?.message === undefined ? null : (
              <span className="mt-1.5 self-start rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 font-mono text-[10px] text-expense">
                {form.formState.errors.description.message}
              </span>
            )}
          </div>

          <div className="flex justify-end gap-2.5 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || create.isPending}>
              {create.isPending ? "Posting…" : "Post entry"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
