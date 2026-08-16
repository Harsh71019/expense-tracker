"use client";

import {
  formatMinor,
  type Goal,
  type SafetyBufferMode,
  type SafetyBufferState
} from "@treasury-ops/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

type SafetyBufferDrawerProps = Readonly<{
  open: boolean;
  onClose: () => void;
  state: SafetyBufferState | null;
  activeGoals: readonly Goal[];
}>;

export function SafetyBufferDrawer({
  open,
  onClose,
  state,
  activeGoals
}: SafetyBufferDrawerProps): ReactNode {
  const router = useRouter();
  const [mode, setMode] = useState<SafetyBufferMode>(state?.preference?.mode ?? "essential_months");
  const [amountRupees, setAmountRupees] = useState<string>(
    state?.preference?.amountMinor ? (state.preference.amountMinor / 100).toString() : "50000"
  );
  const [months, setMonths] = useState<number>(state?.preference?.months ?? 3);
  const [emergencyFundGoalId, setEmergencyFundGoalId] = useState<string>(
    state?.preference?.emergencyFundGoalId ?? activeGoals[0]?.id ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload: {
        mode: SafetyBufferMode;
        amountMinor?: number;
        months?: number;
        emergencyFundGoalId?: string;
      } = { mode };

      if (mode === "fixed_amount") {
        const rupees = parseFloat(amountRupees);
        if (isNaN(rupees) || rupees < 0) {
          setError("Please enter a valid amount.");
          setSubmitting(false);
          return;
        }
        payload.amountMinor = Math.round(rupees * 100);
      } else if (mode === "essential_months") {
        payload.months = months;
      } else if (mode === "emergency_fund_goal") {
        if (!emergencyFundGoalId) {
          setError("Please select an emergency fund goal.");
          setSubmitting(false);
          return;
        }
        payload.emergencyFundGoalId = emergencyFundGoalId;
      }

      const res = await fetch("/api/v1/safety-buffer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID()
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        setError(problem.detail ?? "Failed to save safety buffer preference.");
        setSubmitting(false);
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setError("An unexpected network error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-elevated p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Safety Buffer Settings</h2>
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
          <div className="my-4 rounded-xl border border-border bg-surface-muted/50 p-3.5 text-xs text-foreground-muted space-y-1">
            <div className="flex justify-between">
              <span>Current Liquid Reserve:</span>
              <span className="font-semibold text-foreground">
                {formatMinor(state.liquidBalanceMinor)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Target Safety Cushion:</span>
              <span className="font-semibold text-foreground">
                {formatMinor(state.targetMinor)}
              </span>
            </div>
            {state.bufferGapMinor > 0 ? (
              <div className="flex justify-between text-warning font-medium">
                <span>Reserve Shortfall (to replenish first):</span>
                <span>{formatMinor(state.bufferGapMinor)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-income font-medium">
                <span>Buffer Surplus (fully funded):</span>
                <span>+{formatMinor(state.bufferSurplusMinor)}</span>
              </div>
            )}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">
              Cushion Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode("essential_months")}
                className={`rounded-lg border px-3 py-2 text-xs font-medium text-center transition-colors ${
                  mode === "essential_months"
                    ? "border-accent bg-accent/10 text-accent font-semibold"
                    : "border-border bg-surface hover:bg-surface-muted text-foreground"
                }`}
              >
                Expense Months
              </button>
              <button
                type="button"
                onClick={() => setMode("fixed_amount")}
                className={`rounded-lg border px-3 py-2 text-xs font-medium text-center transition-colors ${
                  mode === "fixed_amount"
                    ? "border-accent bg-accent/10 text-accent font-semibold"
                    : "border-border bg-surface hover:bg-surface-muted text-foreground"
                }`}
              >
                Fixed Amount
              </button>
              <button
                type="button"
                onClick={() => setMode("emergency_fund_goal")}
                className={`rounded-lg border px-3 py-2 text-xs font-medium text-center transition-colors ${
                  mode === "emergency_fund_goal"
                    ? "border-accent bg-accent/10 text-accent font-semibold"
                    : "border-border bg-surface hover:bg-surface-muted text-foreground"
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
                className="block text-xs font-semibold text-foreground-muted mb-1"
              >
                Number of Essential Expense Months
              </label>
              <select
                id="buffer-months"
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
              >
                {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} {m === 1 ? "month" : "months"} of essential outflows
                  </option>
                ))}
              </select>
              <p className="mt-1 text-2xs text-foreground-muted">
                Multiplies monthly recurring commitments and credit card bills.
              </p>
            </div>
          ) : null}

          {mode === "fixed_amount" ? (
            <div>
              <label
                htmlFor="buffer-rupees"
                className="block text-xs font-semibold text-foreground-muted mb-1"
              >
                Fixed Liquid Cushion (₹)
              </label>
              <input
                id="buffer-rupees"
                type="number"
                min="0"
                step="1000"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                placeholder="50000"
              />
            </div>
          ) : null}

          {mode === "emergency_fund_goal" ? (
            <div>
              <label
                htmlFor="buffer-goal"
                className="block text-xs font-semibold text-foreground-muted mb-1"
              >
                Select Linked Emergency Goal
              </label>
              {activeGoals.length === 0 ? (
                <p className="text-xs text-warning">No active goals available to link.</p>
              ) : (
                <select
                  id="buffer-goal"
                  value={emergencyFundGoalId}
                  onChange={(e) => setEmergencyFundGoalId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
                >
                  {activeGoals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({formatMinor(g.targetMinor)})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : null}

          {error ? <p className="text-xs text-expense font-medium">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
