"use client";

import { CreateTransactionSchema, type CreateTransaction } from "@treasury-ops/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toDatetimeLocalValue } from "@/lib/datetime-local";
import { ValidationError } from "@/lib/errors";
import { toast } from "sonner";

import { useAccounts } from "../hooks/use-accounts";
import { useCategories } from "../hooks/use-categories";
import { useCreateTxn } from "../hooks/use-create-txn";
import { AccountSetup } from "./account-setup";

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

export function QuickAddForm(): ReactNode {
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const accounts = useAccounts();
  const categories = useCategories();
  const create = useCreateTxn();
  const form = useForm<CreateTransaction>({
    defaultValues: {
      type: "expense",
      amountMinor: 0,
      occurredAt: new Date(),
      description: "",
      tags: []
    }
  });
  const type = form.watch("type");
  const matchingCategories = (categories.data ?? []).filter(
    (category) => category.kind === type && !category.isArchived
  );

  async function submit(values: CreateTransaction): Promise<void> {
    const parsed = CreateTransactionSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const name = fieldErrorName(issue.path.join("."));
        if (name !== null) {
          form.setError(name, { message: issue.message });
        }
      }
      return;
    }
    try {
      await create.mutateAsync({ ...parsed.data, idempotencyKey });
      toast.success("Transaction recorded in ledger");
      form.reset({
        type: "expense",
        amountMinor: 0,
        occurredAt: new Date(),
        description: "",
        tags: []
      });
      setIdempotencyKey(crypto.randomUUID());
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        for (const field of error.fields) {
          const name = fieldErrorName(field.path);
          if (name !== null) {
            form.setError(name, { message: field.message });
          }
        }
      } else {
        toast.error("Failed to record transaction");
      }
    }
  }

  if (accounts.isLoading) {
    return <p className="text-sm text-foreground-muted">Loading your accounts…</p>;
  }

  if ((accounts.data ?? []).filter((account) => !account.isArchived).length === 0) {
    return <AccountSetup />;
  }

  const inputClasses =
    "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
  return (
    <section>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Capture it while it’s fresh
        </h1>
        <p className="mt-1.5 text-sm text-foreground-muted">
          Every save is idempotent and recorded in the ledger.
        </p>
      </div>
      <form
        onSubmit={form.handleSubmit(submit)}
        className="space-y-6 rounded-xl border border-border bg-surface-elevated p-6"
      >
        <div
          className="relative grid grid-cols-2 rounded-lg bg-surface-muted p-1 border border-border/50"
          aria-label="Transaction type"
        >
          {/* Animated active sliding pill */}
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
              className={`relative z-10 flex py-2 text-xs font-semibold items-center justify-center transition-colors rounded-lg focus:outline-none ${
                type === value ? "text-accent" : "text-foreground-muted hover:text-foreground"
              }`}
              onClick={() => form.setValue("type", value, { shouldValidate: true })}
            >
              {value === "expense" ? "Expense" : "Income"}
            </button>
          ))}
        </div>
        <AmountInput
          id="amountMinor"
          label="Amount"
          value={form.watch("amountMinor")}
          onChange={(amountMinor) =>
            form.setValue("amountMinor", amountMinor, { shouldValidate: true })
          }
          {...(form.formState.errors.amountMinor?.message === undefined
            ? {}
            : { error: form.formState.errors.amountMinor.message })}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
            Account
            <select className={inputClasses} {...form.register("accountId")}>
              <option value="">Choose account</option>
              {(accounts.data ?? [])
                .filter((account) => !account.isArchived)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </select>
            {form.formState.errors.accountId?.message === undefined ? null : (
              <span className="text-expense font-mono text-[10px] normal-case mt-1.5 rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 self-start">
                {form.formState.errors.accountId.message}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1.5 font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
            Category
            <select className={inputClasses} {...form.register("categoryId")}>
              <option value="">No category</option>
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
            id="description"
            label="What was it?"
            placeholder="Chai near the station"
            {...form.register("description")}
          />
          {form.formState.errors.description?.message === undefined ? null : (
            <p className="text-expense font-mono text-[10px] mt-1.5 rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 self-start">
              {form.formState.errors.description.message}
            </p>
          )}
        </div>
        <Input
          id="tags"
          label="Tags (optional, comma separated)"
          placeholder="food, commute"
          value={form.watch("tags").join(", ")}
          onChange={(event) =>
            form.setValue(
              "tags",
              event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter((tag) => tag !== ""),
              { shouldValidate: true }
            )
          }
        />
        <label className="flex flex-col gap-1.5 font-mono text-[10px] font-bold tracking-wider text-foreground-muted uppercase">
          When
          <input
            type="datetime-local"
            className={inputClasses}
            value={toDatetimeLocalValue(form.watch("occurredAt"))}
            onChange={(event) =>
              form.setValue("occurredAt", new Date(event.target.value), { shouldValidate: true })
            }
          />
        </label>
        {create.isError && !(create.error instanceof ValidationError) ? (
          <p className="text-expense border border-expense/20 bg-expense/10 px-3.5 py-2.5 rounded-lg font-mono text-[11px] font-semibold text-center">
            Could not save. Your entry is still ready to retry.
          </p>
        ) : null}
        {create.isSuccess ? (
          <p className="text-income border border-income/20 bg-income/10 px-3.5 py-2.5 rounded-lg font-mono text-[11px] font-semibold text-center animate-fade-in">
            Saved to your ledger.
          </p>
        ) : null}
        <Button type="submit" className="w-full py-3" disabled={create.isPending}>
          {create.isPending ? "Posting safely…" : "Add to ledger"}
        </Button>
      </form>
    </section>
  );
}
