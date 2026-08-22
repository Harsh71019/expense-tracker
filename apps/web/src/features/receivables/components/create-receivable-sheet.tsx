"use client";

import { CreateReceivableSchema } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogSurface } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAccounts } from "@/features/accounts";
import { ValidationError } from "@/lib/errors";

import { useCreateReceivable } from "../hooks/use-receivable-mutations";
import { calendarDateInIndia, todayInIndia } from "../model/receivable-form";

type FundingMode = "lend_now" | "opening_balance";

export function CreateReceivableSheet({ onClose }: Readonly<{ onClose: () => void }>): ReactNode {
  const create = useCreateReceivable();
  const accounts = useAccounts();
  const activeAccounts = (accounts.data ?? []).filter((account) => !account.isArchived);

  const [mode, setMode] = useState<FundingMode>("lend_now");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amountMinor, setAmountMinor] = useState(0);
  const [openedAt, setOpenedAt] = useState(todayInIndia);
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();

  async function submit(): Promise<void> {
    const shared = {
      counterpartyName,
      openedAt: calendarDateInIndia(openedAt),
      ...(dueAt === "" ? {} : { dueAt: calendarDateInIndia(dueAt) }),
      ...(note.trim() === "" ? {} : { note: note.trim() })
    };
    const parsed = CreateReceivableSchema.safeParse(
      mode === "lend_now"
        ? {
            fundingMode: "lend_now",
            ...shared,
            principalMinor: amountMinor,
            accountId,
            description
          }
        : { fundingMode: "opening_balance", ...shared, outstandingMinor: amountMinor }
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    setError(undefined);
    try {
      await create.mutateAsync(parsed.data);
      toast.success(mode === "lend_now" ? "Lent — recorded and posted" : "Debt given recorded");
      onClose();
    } catch (caught: unknown) {
      if (caught instanceof ValidationError) {
        setError(caught.fields[0]?.message ?? caught.message);
      } else {
        toast.error("Could not record this debt");
      }
    }
  }

  const canSubmit =
    counterpartyName.trim().length > 0 &&
    amountMinor > 0 &&
    (mode === "opening_balance" || (accountId !== "" && description.trim().length > 0));

  return (
    <DialogSurface labelledBy="create-receivable-title" onClose={onClose} variant="drawer">
      <div className="flex items-start justify-between gap-4">
        <h2
          id="create-receivable-title"
          className="text-xl font-bold tracking-tight text-foreground"
        >
          Add debt given
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close form"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={mode === "lend_now"}
          onClick={() => setMode("lend_now")}
          className={`min-h-11 rounded-[11px] border px-3.5 py-3 text-left text-[12.5px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            mode === "lend_now"
              ? "border-accent bg-accent-glow text-accent"
              : "border-border bg-surface-muted text-foreground"
          }`}
        >
          Lend money now
        </button>
        <button
          type="button"
          aria-pressed={mode === "opening_balance"}
          onClick={() => setMode("opening_balance")}
          className={`min-h-11 rounded-[11px] border px-3.5 py-3 text-left text-[12.5px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            mode === "opening_balance"
              ? "border-accent bg-accent-glow text-accent"
              : "border-border bg-surface-muted text-foreground"
          }`}
        >
          Add money already lent
        </button>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-foreground-muted">
        {mode === "lend_now"
          ? "Cash leaves the selected account now. Net worth is unchanged — cash becomes a receivable."
          : "No account changes. Net worth rises by this amount because it records money already owed to you that wasn't tracked before."}
      </p>

      <div className="mt-5 space-y-5">
        <Input
          id="receivable-counterparty"
          label="Who owes this?"
          autoComplete="off"
          maxLength={80}
          placeholder="e.g. Rohan"
          value={counterpartyName}
          onChange={(event) => setCounterpartyName(event.target.value)}
        />

        {mode === "lend_now" ? (
          <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            <span>From account</span>
            <Select
              id="receivable-account"
              aria-label="From account"
              options={[
                { value: "", label: "Choose account" },
                ...activeAccounts.map((account) => ({ value: account.id, label: account.name }))
              ]}
              value={accountId}
              onChange={setAccountId}
            />
          </div>
        ) : null}

        <AmountInput
          id="receivable-amount"
          label={mode === "lend_now" ? "Amount lent" : "Amount currently owed"}
          value={amountMinor}
          onChange={setAmountMinor}
        />

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            <span>{mode === "lend_now" ? "Lent on" : "As of"}</span>
            <DatePicker
              id="receivable-opened"
              aria-label="Date"
              value={openedAt}
              onChange={setOpenedAt}
            />
          </div>
          <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            <span>Due date (optional)</span>
            <DatePicker
              id="receivable-due"
              aria-label="Due date"
              clearable
              value={dueAt}
              onChange={setDueAt}
            />
          </div>
        </div>

        {mode === "lend_now" ? (
          <Input
            id="receivable-description"
            label="Transaction description"
            autoComplete="off"
            maxLength={500}
            placeholder={`Lent to ${counterpartyName || "…"}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        ) : null}

        <Input
          id="receivable-note"
          label="Note (optional)"
          autoComplete="off"
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {error === undefined ? null : (
        <p role="alert" className="mt-3 text-sm text-expense">
          {error}
        </p>
      )}

      <div className="safe-area-bottom sticky bottom-0 -mx-5 mt-7 flex flex-col-reverse gap-2.5 border-t border-border bg-surface-elevated px-5 pt-4 pb-4 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0">
        <Button type="button" className="w-full sm:w-auto" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={!canSubmit || create.isPending}
          onClick={() => void submit()}
        >
          {create.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </DialogSurface>
  );
}
