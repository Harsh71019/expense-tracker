"use client";

import {
  formatMinor,
  type Goal,
  type SafetyBufferMode,
  type SafetyBufferState
} from "@treasury-ops/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import { useSaveSafetyBuffer } from "../hooks/use-goals";

type SafetyBufferDrawerProps = Readonly<{
  open: boolean;
  onClose: () => void;
  state: SafetyBufferState | null;
  activeGoals: readonly Goal[];
}>;

function defaultAmountMinor(state: SafetyBufferState | null): number {
  return state?.preference?.amountMinor ?? 5_000_000;
}

export function SafetyBufferDrawer({
  open,
  onClose,
  state,
  activeGoals
}: SafetyBufferDrawerProps): ReactNode {
  const router = useRouter();
  const saveSafetyBuffer = useSaveSafetyBuffer();
  const [mode, setMode] = useState<SafetyBufferMode>("essential_months");
  const [amountMinor, setAmountMinor] = useState(0);
  const [months, setMonths] = useState(3);
  const [emergencyFundGoalId, setEmergencyFundGoalId] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setMode(state?.preference?.mode ?? "essential_months");
    setAmountMinor(defaultAmountMinor(state));
    setMonths(state?.preference?.months ?? 3);
    setEmergencyFundGoalId(state?.preference?.emergencyFundGoalId ?? activeGoals[0]?.id ?? "");
    setError(undefined);
  }, [activeGoals, open, state]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);

    if (mode === "fixed_amount" && amountMinor <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (mode === "emergency_fund_goal" && emergencyFundGoalId === "") {
      setError("Please select an emergency fund goal.");
      return;
    }

    const payload =
      mode === "fixed_amount"
        ? { mode, amountMinor }
        : mode === "essential_months"
          ? { mode, months }
          : { mode, emergencyFundGoalId };

    try {
      await saveSafetyBuffer.mutateAsync(payload);
      toast.success("Safety buffer preferences saved");
      router.refresh();
      onClose();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : "Failed to save safety buffer preference."
      );
    }
  }

  return (
    <DialogSurface
      labelledBy="safety-buffer-title"
      onClose={onClose}
      variant="drawer"
      panelClassName="max-w-lg"
    >
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 id="safety-buffer-title" className="text-lg font-bold text-foreground">
            Safety Buffer Settings
          </h2>
          <p className="text-xs text-foreground-muted">
            Configure your reserve cushion before cash is allocated to goals
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="rounded-lg p-2 text-foreground-muted hover:bg-surface-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>

      {state ? (
        <div className="my-4 space-y-1 rounded-xl border border-border bg-surface-muted/50 p-3.5 text-xs text-foreground-muted">
          <div className="flex justify-between">
            <span>Current Liquid Reserve:</span>
            <span className="font-semibold text-foreground">
              {formatMinor(state.liquidBalanceMinor)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Target Safety Cushion:</span>
            <span className="font-semibold text-foreground">{formatMinor(state.targetMinor)}</span>
          </div>
          {state.bufferGapMinor > 0 ? (
            <div className="flex justify-between font-medium text-warning">
              <span>Reserve Shortfall (to replenish first):</span>
              <span>{formatMinor(state.bufferGapMinor)}</span>
            </div>
          ) : (
            <div className="flex justify-between font-medium text-income">
              <span>Buffer Surplus (fully funded):</span>
              <span>+{formatMinor(state.bufferSurplusMinor)}</span>
            </div>
          )}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <p className="mb-1.5 block text-xs font-semibold text-foreground-muted">Cushion Method</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMode("essential_months")}
              className={`rounded-lg border px-3 py-2 text-center text-xs font-medium transition-colors ${
                mode === "essential_months"
                  ? "border-accent bg-accent/10 font-semibold text-accent"
                  : "border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              Expense Months
            </button>
            <button
              type="button"
              onClick={() => setMode("fixed_amount")}
              className={`rounded-lg border px-3 py-2 text-center text-xs font-medium transition-colors ${
                mode === "fixed_amount"
                  ? "border-accent bg-accent/10 font-semibold text-accent"
                  : "border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              Fixed Amount
            </button>
            <button
              type="button"
              onClick={() => setMode("emergency_fund_goal")}
              className={`rounded-lg border px-3 py-2 text-center text-xs font-medium transition-colors ${
                mode === "emergency_fund_goal"
                  ? "border-accent bg-accent/10 font-semibold text-accent"
                  : "border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              Linked Goal
            </button>
          </div>
        </div>

        {mode === "essential_months" ? (
          <div>
            <label
              htmlFor="buffer-months"
              className="mb-1 block text-xs font-semibold text-foreground-muted"
            >
              Number of Essential Expense Months
            </label>
            <select
              id="buffer-months"
              value={months}
              onChange={(event) => setMonths(Number(event.target.value))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
            >
              {[1, 2, 3, 4, 5, 6, 9, 12].map((monthCount) => (
                <option key={monthCount} value={monthCount}>
                  {monthCount} {monthCount === 1 ? "month" : "months"} of essential outflows
                </option>
              ))}
            </select>
            <p className="mt-1 text-2xs text-foreground-muted">
              Multiplies monthly recurring commitments and credit card bills.
            </p>
          </div>
        ) : null}

        {mode === "fixed_amount" ? (
          <AmountInput
            id="buffer-amount"
            label="Fixed Liquid Cushion"
            value={amountMinor}
            onChange={setAmountMinor}
            {...(error === undefined ? {} : { error })}
          />
        ) : null}

        {mode === "emergency_fund_goal" ? (
          <div>
            <label
              htmlFor="buffer-goal"
              className="mb-1 block text-xs font-semibold text-foreground-muted"
            >
              Select Linked Emergency Goal
            </label>
            {activeGoals.length === 0 ? (
              <p className="text-xs text-warning">No active goals available to link.</p>
            ) : (
              <select
                id="buffer-goal"
                value={emergencyFundGoalId}
                onChange={(event) => setEmergencyFundGoalId(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
              >
                {activeGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.name} ({formatMinor(goal.targetMinor)})
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}

        {error && mode !== "fixed_amount" ? (
          <p className="text-xs font-medium text-expense">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saveSafetyBuffer.isPending}>
            {saveSafetyBuffer.isPending ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </form>
    </DialogSurface>
  );
}
