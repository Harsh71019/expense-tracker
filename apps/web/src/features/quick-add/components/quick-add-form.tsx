"use client";

import { CreateTransactionSchema, type CreateTransaction } from "@treasury-ops/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccounts } from "@/features/accounts";
import { useCategories } from "@/features/categories";
import { toDatetimeLocalValue } from "@/lib/datetime-local";
import { userErrorMessage, ValidationError } from "@/lib/errors";
import { generateRequestId } from "@/lib/request-id";
import { toast } from "@/lib/toast";

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
  const [idempotencyKey, setIdempotencyKey] = useState(generateRequestId);
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
      setIdempotencyKey(generateRequestId());
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        for (const field of error.fields) {
          const name = fieldErrorName(field.path);
          if (name !== null) {
            form.setError(name, { message: field.message });
          }
        }
      } else {
        toast.error(userErrorMessage(error, "Could not record this transaction."));
      }
    }
  }

  if (accounts.isLoading) {
    return <p className="text-sm text-foreground-muted">Loading your accounts…</p>;
  }

  if ((accounts.data ?? []).filter((account) => !account.isArchived).length === 0) {
    return <AccountSetup />;
  }

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
        className="space-y-6 rounded-xl border border-border bg-surface-elevated p-4 sm:p-6"
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
              className={`relative z-10 flex min-h-11 items-center justify-center rounded-lg py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
          <div className="flex flex-col gap-1.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            <span>Account</span>
            <Select
              aria-label="Account"
              name="accountId"
              options={[
                { value: "", label: "Choose account" },
                ...(accounts.data ?? [])
                  .filter((account) => !account.isArchived)
                  .map((account) => ({ value: account.id, label: account.name }))
              ]}
              placeholder="Choose account"
              value={form.watch("accountId") ?? ""}
              onChange={(val) => form.setValue("accountId", val, { shouldValidate: true })}
            />
            {form.formState.errors.accountId?.message === undefined ? null : (
              <span className="text-expense font-mono text-2xs normal-case mt-1.5 rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 self-start">
                {form.formState.errors.accountId.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
            <span>Category</span>
            <Select
              aria-label="Category"
              name="categoryId"
              options={[
                { value: "", label: "No category" },
                ...matchingCategories.map((category) => ({
                  value: category.id,
                  label: category.name
                }))
              ]}
              placeholder="No category"
              value={form.watch("categoryId") ?? ""}
              onChange={(val) =>
                form.setValue("categoryId", val === "" ? undefined : val, { shouldValidate: true })
              }
            />
          </div>
        </div>
        <div className="flex flex-col">
          <Input
            id="description"
            label="What was it?"
            placeholder="Chai near the station…"
            autoComplete="off"
            {...form.register("description")}
          />
          {form.formState.errors.description?.message === undefined ? null : (
            <p className="text-expense font-mono text-2xs mt-1.5 rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 self-start">
              {form.formState.errors.description.message}
            </p>
          )}
        </div>
        <Input
          id="tags"
          label="Tags (optional, comma separated)"
          name="tags"
          placeholder="food, commute…"
          autoComplete="off"
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
        <div className="flex flex-col gap-1.5 font-mono text-2xs font-bold tracking-wider text-foreground-muted uppercase">
          <span>When</span>
          <DatePicker
            name="occurredAt"
            aria-label="When"
            placeholder="When"
            includeTime
            value={toDatetimeLocalValue(form.watch("occurredAt"))}
            onChange={(val) =>
              form.setValue("occurredAt", val ? new Date(val) : new Date(), {
                shouldValidate: true
              })
            }
          />
        </div>
        {create.isError && !(create.error instanceof ValidationError) ? (
          <p
            role="alert"
            className="text-expense border border-expense/20 bg-expense/10 px-3.5 py-2.5 rounded-lg font-mono text-2xs font-semibold text-center"
          >
            Could not save. Your entry is still ready to retry.
          </p>
        ) : null}
        {create.isSuccess ? (
          <p
            role="status"
            className="text-income border border-income/20 bg-income/10 px-3.5 py-2.5 rounded-lg font-mono text-2xs font-semibold text-center animate-fade-in"
          >
            Saved to your ledger.
          </p>
        ) : null}
        <div className="sticky bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom,0px))] z-20 -mx-4 border-t border-border bg-surface-elevated/95 p-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <Button type="submit" className="w-full py-3" disabled={create.isPending}>
            {create.isPending ? "Posting safely…" : "Add to ledger"}
          </Button>
        </div>
      </form>
    </section>
  );
}
