"use client";

import {
  formatMinor,
  RecordReceivableRepaymentSchema,
  type Receivable
} from "@treasury-ops/shared";
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

import { useRecordReceivableRepayment } from "../hooks/use-receivable-mutations";
import {
  calendarDateInIndia,
  repaymentDefaultDescription,
  todayInIndia
} from "../model/receivable-form";
import { LinkExistingRepayment } from "./link-existing-repayment";

type CaptureMode = "receive_now" | "link_existing";

export function RecordRepaymentSheet({
  receivable,
  onClose
}: Readonly<{ receivable: Receivable; onClose: () => void }>): ReactNode {
  const record = useRecordReceivableRepayment();
  const accounts = useAccounts();
  const activeAccounts = (accounts.data ?? []).filter((account) => !account.isArchived);

  const [mode, setMode] = useState<CaptureMode>("receive_now");
  const [accountId, setAccountId] = useState("");
  const [amountMinor, setAmountMinor] = useState(0);
  const [occurredAt, setOccurredAt] = useState(todayInIndia);
  const [description, setDescription] = useState(() =>
    repaymentDefaultDescription(receivable.counterpartyName)
  );
  const [linkedTransactionId, setLinkedTransactionId] = useState<string>();
  const [error, setError] = useState<string>();

  const willSettle = mode === "receive_now" && amountMinor === receivable.outstandingMinor;

  async function submit(): Promise<void> {
    const parsed = RecordReceivableRepaymentSchema.safeParse(
      mode === "receive_now"
        ? {
            captureMode: "receive_now",
            accountId,
            amountMinor,
            occurredAt: calendarDateInIndia(occurredAt),
            description
          }
        : { captureMode: "link_existing", transactionId: linkedTransactionId ?? "" }
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the repayment details.");
      return;
    }
    setError(undefined);
    try {
      const result = await record.mutateAsync({ receivableId: receivable.id, body: parsed.data });
      toast.success(
        result.receivable.status === "settled"
          ? `Settled — ${receivable.counterpartyName} has repaid in full`
          : `Repayment recorded — ${formatMinor(result.receivable.outstandingMinor)} still outstanding`
      );
      onClose();
    } catch (caught: unknown) {
      if (caught instanceof ValidationError) {
        setError(caught.fields[0]?.message ?? caught.message);
      } else {
        toast.error("Could not record this repayment");
      }
    }
  }

  const canSubmit =
    mode === "receive_now"
      ? accountId !== "" &&
        amountMinor > 0 &&
        amountMinor <= receivable.outstandingMinor &&
        description.trim().length > 0
      : linkedTransactionId !== undefined;

  return (
    <DialogSurface labelledBy="record-repayment-title" onClose={onClose} variant="drawer">
      <div className="flex items-start justify-between gap-4">
        <h2
          id="record-repayment-title"
          className="text-xl font-bold tracking-tight text-foreground"
        >
          Record repayment
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
      <p className="mt-1 text-sm text-foreground-muted">
        {receivable.counterpartyName} owes {formatMinor(receivable.outstandingMinor)}.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={mode === "receive_now"}
          onClick={() => setMode("receive_now")}
          className={`min-h-11 rounded-[11px] border px-3.5 py-3 text-left text-[12.5px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            mode === "receive_now"
              ? "border-accent bg-accent-glow text-accent"
              : "border-border bg-surface-muted text-foreground"
          }`}
        >
          Receive into account
        </button>
        <button
          type="button"
          aria-pressed={mode === "link_existing"}
          onClick={() => setMode("link_existing")}
          className={`min-h-11 rounded-[11px] border px-3.5 py-3 text-left text-[12.5px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            mode === "link_existing"
              ? "border-accent bg-accent-glow text-accent"
              : "border-border bg-surface-muted text-foreground"
          }`}
        >
          Link an existing deposit
        </button>
      </div>

      {mode === "receive_now" ? (
        <div className="mt-5 space-y-5">
          <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            <span>Destination account</span>
            <Select
              id="repayment-account"
              aria-label="Destination account"
              options={[
                { value: "", label: "Choose account" },
                ...activeAccounts.map((account) => ({ value: account.id, label: account.name }))
              ]}
              value={accountId}
              onChange={setAccountId}
            />
          </div>

          <AmountInput
            id="repayment-amount"
            label="Amount received"
            value={amountMinor}
            onChange={(next) => setAmountMinor(Math.min(next, receivable.outstandingMinor))}
          />
          {amountMinor > receivable.outstandingMinor ? (
            <p role="alert" className="text-xs font-medium text-expense">
              Cannot exceed the outstanding balance of {formatMinor(receivable.outstandingMinor)}.
            </p>
          ) : null}
          {willSettle ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-lg border border-income/30 bg-income/10 px-3 py-2 text-xs font-semibold text-income"
            >
              This will settle the debt.
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
            <span>Received on</span>
            <DatePicker
              id="repayment-date"
              aria-label="Received on"
              value={occurredAt}
              onChange={setOccurredAt}
            />
          </div>

          <Input
            id="repayment-description"
            label="Description"
            autoComplete="off"
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      ) : (
        <LinkExistingRepayment
          outstandingMinor={receivable.outstandingMinor}
          selectedTransactionId={linkedTransactionId}
          onSelect={setLinkedTransactionId}
        />
      )}

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
          disabled={!canSubmit || record.isPending}
          onClick={() => void submit()}
        >
          {record.isPending ? "Recording…" : "Record repayment"}
        </Button>
      </div>
    </DialogSurface>
  );
}
