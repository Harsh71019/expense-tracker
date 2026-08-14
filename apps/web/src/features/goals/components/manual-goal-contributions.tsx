"use client";

import type { GoalContribution } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";

import { useGoalContributions } from "../hooks/use-goals";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type ManualGoalContributionsProps = Readonly<{
  goalId: string;
  initialContributions: GoalContribution[];
  onAddDeposit: () => void;
  onAddWithdrawal: () => void;
}>;

export function ManualGoalContributions({
  goalId,
  initialContributions,
  onAddDeposit,
  onAddWithdrawal
}: ManualGoalContributionsProps): ReactNode {
  const query = useGoalContributions(goalId, initialContributions);
  const contributions = query.data ?? initialContributions;

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
            Contribution Ledger
          </p>
          <h2 className="mt-1 text-lg font-bold text-foreground">History</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddDeposit}
            className="min-h-9 rounded-lg border border-income/30 bg-income/10 px-3 py-1.5 text-xs font-semibold text-income transition-colors hover:bg-income/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-income"
          >
            + Deposit
          </button>
          <button
            type="button"
            onClick={onAddWithdrawal}
            className="min-h-9 rounded-lg border border-expense/30 bg-expense/10 px-3 py-1.5 text-xs font-semibold text-expense transition-colors hover:bg-expense/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense"
          >
            − Withdraw
          </button>
        </div>
      </div>

      {contributions.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-surface-muted/50 p-6 text-center">
          <p className="text-sm font-medium text-foreground">No contributions recorded yet</p>
          <p className="mt-1 text-xs text-foreground-muted">
            Add your first deposit to start building progress toward this goal.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={onAddDeposit}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-background hover:bg-accent/90"
            >
              Add initial deposit
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-border">
          {contributions.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded px-1.5 py-0.5 font-mono text-2xs font-bold uppercase ${
                      item.type === "deposit"
                        ? "bg-income/15 text-income"
                        : "bg-expense/15 text-expense"
                    }`}
                  >
                    {item.type === "deposit" ? "Deposit" : "Withdrawal"}
                  </span>
                  <span className="truncate text-sm font-semibold text-foreground">
                    {item.note ??
                      (item.type === "deposit" ? "Manual deposit" : "Manual withdrawal")}
                  </span>
                </div>
                <span className="mt-0.5 block font-mono text-2xs text-foreground-muted">
                  {dateFormatter.format(item.occurredAt)}
                </span>
              </div>
              <Money
                minor={item.amountMinor}
                variant={item.type === "deposit" ? "income" : "expense"}
                signed
                size="sm"
                className="shrink-0"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
