"use client";

import { CreateTransferSchema, parseMinor, type CreateTransfer } from "@vyaya/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/features/accounts";
import { ValidationError } from "@/lib/errors";

import { useCreateTransfer } from "../hooks/use-transfers";

const selectClasses =
  "w-full rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function fieldErrorName(path: string): keyof CreateTransfer | null {
  if (
    path === "fromAccountId" ||
    path === "toAccountId" ||
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

export function CreateTransferSheet({ onClose }: Readonly<{ onClose: () => void }>): ReactNode {
  const accounts = useAccounts();
  const create = useCreateTransfer();
  const [amountDraft, setAmountDraft] = useState("");
  const form = useForm<CreateTransfer>({
    defaultValues: {
      fromAccountId: "",
      toAccountId: "",
      amountMinor: 0,
      occurredAt: new Date(`${todayInputValue()}T00:00:00.000Z`),
      description: "",
      tags: []
    }
  });
  const activeAccounts = (accounts.data ?? []).filter((account) => !account.isArchived);
  const fromAccountId = form.watch("fromAccountId");
  const toAccountId = form.watch("toAccountId");
  const toOptions = activeAccounts.filter((account) => account.id !== fromAccountId);
  const sameAccount = fromAccountId !== "" && fromAccountId === toAccountId;

  function selectFrom(nextFrom: string): void {
    const nextTo =
      toAccountId === nextFrom
        ? (activeAccounts.find((account) => account.id !== nextFrom)?.id ?? "")
        : toAccountId;
    form.setValue("fromAccountId", nextFrom, { shouldValidate: true });
    form.setValue("toAccountId", nextTo, { shouldValidate: true });
  }

  function swap(): void {
    form.setValue("fromAccountId", toAccountId, { shouldValidate: true });
    form.setValue("toAccountId", fromAccountId, { shouldValidate: true });
  }

  async function submit(values: CreateTransfer): Promise<void> {
    const parsed = CreateTransferSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const name = fieldErrorName(issue.path.join("."));
        if (name !== null) form.setError(name, { message: issue.message });
      }
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      toast.success("Transfer posted to the ledger");
      onClose();
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        for (const field of error.fields) {
          const name = fieldErrorName(field.path);
          if (name !== null) form.setError(name, { message: field.message });
        }
      } else {
        toast.error("Could not post this transfer");
      }
    }
  }

  const canSubmit =
    fromAccountId !== "" &&
    toAccountId !== "" &&
    !sameAccount &&
    form.watch("amountMinor") > 0 &&
    form.watch("description").trim().length > 0;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-transfer-title"
        className="h-screen w-full max-w-md overflow-y-auto border-l border-border bg-surface-elevated p-7 animate-drawer-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="create-transfer-title"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            New transfer
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
          Posts two linked legs at once. Amount, accounts, and date are permanent once posted.
        </p>

        <form
          onSubmit={form.handleSubmit((values) => void submit(values))}
          className="mt-6 space-y-1"
        >
          <label
            htmlFor="create-transfer-from"
            className="mt-4 block font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
          >
            From account
          </label>
          <select
            id="create-transfer-from"
            className={`${selectClasses} mt-1.5`}
            value={fromAccountId}
            onChange={(event) => selectFrom(event.target.value)}
          >
            <option value="">Choose account</option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>

          <div className="flex justify-center py-1.5">
            <button
              type="button"
              onClick={swap}
              aria-label="Swap from and to accounts"
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-accent/10 text-base text-accent hover:bg-accent/15"
            >
              ⇅
            </button>
          </div>

          <label
            htmlFor="create-transfer-to"
            className="block font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
          >
            To account
          </label>
          <select
            id="create-transfer-to"
            className={`${selectClasses} mt-1.5`}
            value={toAccountId}
            onChange={(event) =>
              form.setValue("toAccountId", event.target.value, { shouldValidate: true })
            }
          >
            <option value="">Choose account</option>
            {toOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          {sameAccount ? (
            <p className="mt-1.5 text-xs font-medium text-expense">
              Source and destination must be different accounts.
            </p>
          ) : null}

          <label
            htmlFor="create-transfer-amount"
            className="mt-5 block font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
          >
            Amount
          </label>
          <div className="mt-1.5 flex items-center gap-1.5 rounded-xl border border-border bg-surface-muted px-3.5">
            <span aria-hidden="true" className="font-mono text-base text-foreground-muted">
              ₹
            </span>
            <input
              id="create-transfer-amount"
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
            <p className="mt-1.5 rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 font-mono text-[10px] text-expense">
              {form.formState.errors.amountMinor.message}
            </p>
          )}

          <label
            htmlFor="create-transfer-date"
            className="mt-5 block font-mono text-[9px] font-extrabold tracking-[0.25em] text-foreground-muted uppercase"
          >
            Date
          </label>
          <input
            id="create-transfer-date"
            type="date"
            className={`${selectClasses} mt-1.5`}
            value={form.watch("occurredAt").toISOString().slice(0, 10)}
            onChange={(event) =>
              form.setValue("occurredAt", new Date(`${event.target.value}T00:00:00.000Z`), {
                shouldValidate: true
              })
            }
          />

          <div className="mt-5">
            <Input
              id="create-transfer-description"
              label="Description"
              placeholder="e.g. Move to investments"
              maxLength={500}
              {...form.register("description")}
            />
            {form.formState.errors.description?.message === undefined ? null : (
              <p className="mt-1.5 rounded-lg border border-expense/25 bg-expense/10 px-2.5 py-0.5 font-mono text-[10px] text-expense">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2.5 pt-6">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || create.isPending}>
              {create.isPending ? "Posting…" : "Post transfer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
