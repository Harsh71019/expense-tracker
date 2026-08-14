"use client";

import {
  CreateGoalContributionSchema,
  type Goal,
  type GoalContributionType
} from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DialogSurface } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

import { useRecordGoalContribution } from "../hooks/use-goals";
import { dateInputToUtc, todayInIndia } from "../model/goal-form";

type GoalContributionDrawerProps = Readonly<{
  goal: Goal;
  defaultType?: GoalContributionType;
  onClose: () => void;
}>;

export function GoalContributionDrawer({
  goal,
  defaultType = "deposit",
  onClose
}: GoalContributionDrawerProps): ReactNode {
  const recordContribution = useRecordGoalContribution();
  const [type, setType] = useState<GoalContributionType>(defaultType);
  const [amountMinor, setAmountMinor] = useState(0);
  const [date, setDate] = useState(todayInIndia());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const isPending = recordContribution.isPending;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (amountMinor <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    let occurredAt: Date;
    try {
      occurredAt = dateInputToUtc(date);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Choose a valid date.");
      return;
    }

    const payload = CreateGoalContributionSchema.safeParse({
      type,
      amountMinor,
      ...(note.trim() === "" ? {} : { note: note.trim() }),
      occurredAt
    });

    if (!payload.success) {
      setError(payload.error.issues[0]?.message ?? "Check the contribution details.");
      return;
    }

    try {
      await recordContribution.mutateAsync({
        goalId: goal.id,
        input: payload.data
      });
      toast.success(type === "deposit" ? "Deposit recorded" : "Withdrawal recorded");
      onClose();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not record this contribution.");
    }
  }

  return (
    <DialogSurface
      labelledBy="goal-contribution-title"
      onClose={onClose}
      variant="drawer"
      panelClassName="max-w-[480px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Manual Envelope
          </p>
          <h2 id="goal-contribution-title" className="mt-1.5 text-xl font-bold text-foreground">
            {type === "deposit" ? "Add to goal" : "Withdraw from goal"}
          </h2>
          <p className="mt-1 text-xs text-foreground-muted">Target: {goal.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close form"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-5">
        <div>
          <span className="mb-1.5 block font-mono text-2xs font-extrabold tracking-[0.22em] text-foreground-muted uppercase">
            Action
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={type === "deposit"}
              onClick={() => setType("deposit")}
              className={`min-h-11 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-income ${
                type === "deposit"
                  ? "border-income/30 bg-income/10 text-income"
                  : "border-border text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              + Deposit
            </button>
            <button
              type="button"
              aria-pressed={type === "withdrawal"}
              onClick={() => setType("withdrawal")}
              className={`min-h-11 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense ${
                type === "withdrawal"
                  ? "border-expense/30 bg-expense/10 text-expense"
                  : "border-border text-foreground-muted hover:bg-surface-muted"
              }`}
            >
              − Withdraw
            </button>
          </div>
        </div>

        <AmountInput
          id="contribution-amount"
          label={type === "deposit" ? "Deposit amount" : "Withdrawal amount"}
          value={amountMinor}
          onChange={setAmountMinor}
        />

        <div className="flex flex-col gap-1.5 font-mono text-2xs font-extrabold tracking-[0.25em] text-foreground-muted uppercase">
          <span>Date</span>
          <DatePicker
            id="contribution-date"
            aria-label="Contribution date"
            value={date}
            onChange={setDate}
          />
        </div>

        <Input
          id="contribution-note"
          name="note"
          autoComplete="off"
          label="Note (optional)"
          value={note}
          maxLength={200}
          placeholder={
            type === "deposit"
              ? "e.g. Cash from freelance, weekly jar savings…"
              : "e.g. Spent on flight ticket, emergency…"
          }
          onChange={(event) => setNote(event.target.value)}
        />

        {error === undefined ? null : (
          <p
            role="alert"
            className="rounded-lg border border-expense/25 bg-expense/10 p-3 text-sm text-expense"
          >
            {error}
          </p>
        )}

        <div className="safe-area-bottom sticky bottom-0 -mx-5 flex flex-col-reverse gap-2 border-t border-border bg-surface-elevated px-5 pt-4 pb-4 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-2 sm:pb-0">
          <Button
            type="button"
            className="w-full sm:w-auto"
            variant="secondary"
            disabled={isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="w-full sm:w-auto"
            variant={type === "deposit" ? "primary" : "danger"}
            disabled={isPending || amountMinor <= 0}
          >
            {isPending ? "Saving…" : type === "deposit" ? "Record deposit" : "Record withdrawal"}
          </Button>
        </div>
      </form>
    </DialogSurface>
  );
}
