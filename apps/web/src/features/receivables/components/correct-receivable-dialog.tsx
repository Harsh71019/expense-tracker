"use client";

import {
  formatMinor,
  CreateReceivableCorrectionSchema,
  type Receivable
} from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ValidationError } from "@/lib/errors";

import { useCreateReceivableCorrection } from "../hooks/use-receivable-mutations";

type Direction = "increase" | "decrease";

export function CorrectReceivableDialog({
  receivable,
  onClose
}: Readonly<{ receivable: Receivable; onClose: () => void }>): ReactNode {
  const correct = useCreateReceivableCorrection();
  const [direction, setDirection] = useState<Direction>("decrease");
  const [amountMinor, setAmountMinor] = useState(0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();

  async function submit(): Promise<void> {
    const parsed = CreateReceivableCorrectionSchema.safeParse({
      direction,
      amountMinor,
      reason
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the correction details.");
      return;
    }
    setError(undefined);
    try {
      await correct.mutateAsync({ receivableId: receivable.id, body: parsed.data });
      toast.success("Correction recorded");
      onClose();
    } catch (caught: unknown) {
      if (caught instanceof ValidationError) {
        setError(caught.fields[0]?.message ?? caught.message);
      } else {
        toast.error("Could not record this correction");
      }
    }
  }

  return (
    <DialogSurface labelledBy="correct-receivable-title" onClose={onClose} variant="dialog">
      <h2
        id="correct-receivable-title"
        className="text-lg font-bold tracking-tight text-foreground"
      >
        Correct balance
      </h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Use this only to fix a mistake — never to record a real repayment or write-off. This appends
        a reasoned correction event; it never edits history.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={direction === "increase"}
          onClick={() => setDirection("increase")}
          className={`min-h-11 rounded-[11px] border px-3.5 py-3 text-left text-[12.5px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            direction === "increase"
              ? "border-accent bg-accent-glow text-accent"
              : "border-border bg-surface-muted text-foreground"
          }`}
        >
          Increase outstanding
        </button>
        <button
          type="button"
          aria-pressed={direction === "decrease"}
          onClick={() => setDirection("decrease")}
          className={`min-h-11 rounded-[11px] border px-3.5 py-3 text-left text-[12.5px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            direction === "decrease"
              ? "border-accent bg-accent-glow text-accent"
              : "border-border bg-surface-muted text-foreground"
          }`}
        >
          Decrease outstanding
        </button>
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-foreground-muted">
        {direction === "increase"
          ? "Net worth rises by this amount — no account changes."
          : "Net worth falls by this amount — no account changes."}
      </p>

      <div className="mt-5 space-y-5">
        <AmountInput
          id="correction-amount"
          label="Amount"
          value={amountMinor}
          onChange={setAmountMinor}
        />
        {direction === "decrease" && amountMinor > receivable.outstandingMinor ? (
          <p role="alert" className="text-xs font-medium text-expense">
            Cannot exceed the outstanding balance of {formatMinor(receivable.outstandingMinor)}.
          </p>
        ) : null}
        <Input
          id="correction-reason"
          label="Reason (required)"
          autoComplete="off"
          maxLength={300}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      {error === undefined ? null : (
        <p role="alert" className="mt-3 text-sm text-expense">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Button type="button" className="w-full sm:w-auto" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={amountMinor <= 0 || reason.trim().length === 0 || correct.isPending}
          onClick={() => void submit()}
        >
          {correct.isPending ? "Saving…" : "Record correction"}
        </Button>
      </div>
    </DialogSurface>
  );
}
