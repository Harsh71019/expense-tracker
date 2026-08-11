"use client";

import {
  formatMinor,
  type Account,
  type Goal,
  type GoalPlan,
  type ListTransactionsQuery,
  type TransactionPage
} from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Money, SignedMoney } from "@/components/ui/money";
import { toast } from "@/lib/toast";

import { useGoalPlan } from "../hooks/use-goal-plan";
import { useAbandonGoal, useGoal } from "../hooks/use-goals";
import { goalVerdict } from "../model/goal-verdict";
import { AbandonGoalDialog } from "./abandon-goal-dialog";
import { GoalContributions } from "./goal-contributions";
import { GoalEditorDrawer } from "./goal-editor-drawer";
import { GoalProgressRing } from "./goal-progress-ring";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

type GoalDetailProps = Readonly<{
  initialGoal: Goal;
  initialPlan: GoalPlan | null;
  accounts: Account[];
  contributionFilters: ListTransactionsQuery;
  initialContributions: TransactionPage;
}>;

export function GoalDetail({
  initialGoal,
  initialPlan,
  accounts,
  contributionFilters,
  initialContributions
}: GoalDetailProps): ReactNode {
  const goalQuery = useGoal(initialGoal.id, initialGoal);
  const planQuery = useGoalPlan(initialGoal.id, initialPlan ?? undefined);
  const abandon = useAbandonGoal();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const goal = goalQuery.data ?? initialGoal;
  const plan = planQuery.data;
  const accountName =
    goal.linkedAccountId === undefined
      ? undefined
      : accounts.find((account) => account.id === goal.linkedAccountId)?.name;
  const verdict = goalVerdict(goal, plan, new Date());

  async function confirmAbandon(): Promise<void> {
    try {
      await abandon.mutateAsync(goal.id);
      setConfirmOpen(false);
      toast.success("Goal abandoned");
    } catch {
      toast.error("Could not abandon this goal");
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[22px] border border-border bg-surface-elevated p-6 sm:p-8">
        <div className="flex flex-wrap items-start gap-5">
          <GoalProgressRing
            progressMinor={goal.progressMinor}
            targetMinor={goal.targetMinor}
            size={116}
          />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-accent uppercase">
              {goal.status}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{goal.name}</h1>
            <p className="mt-2 text-sm text-foreground-muted">
              {goal.fundingMode === "linked_account"
                ? `Progress from ${accountName ?? "linked account"}`
                : `Progress from #${goal.tag ?? "tagged"} entries`}
            </p>
            <div className="mt-5 flex flex-wrap items-baseline gap-2">
              <SignedMoney minor={goal.progressMinor} size="hero" />
              <span className="text-sm text-foreground-muted">of</span>
              <Money minor={goal.targetMinor} size="lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            {goal.status === "active" ? (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="min-h-11 rounded-lg border border-expense/30 px-4 py-2.5 text-sm font-semibold text-expense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense"
              >
                Abandon
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Fact label="Plan" value={verdict.label} />
        <Fact
          label="Target date"
          value={
            goal.targetDate === undefined ? "No deadline" : dateFormatter.format(goal.targetDate)
          }
        />
        <Fact
          label="Monthly pace"
          value={
            plan?.requiredMonthlyMinor === null || plan?.requiredMonthlyMinor === undefined
              ? "Not enough history"
              : formatMinor(plan.requiredMonthlyMinor)
          }
        />
      </div>

      <GoalContributions filters={contributionFilters} initialPage={initialContributions} />

      {editOpen ? (
        <GoalEditorDrawer goal={goal} accounts={accounts} onClose={() => setEditOpen(false)} />
      ) : null}
      {confirmOpen ? (
        <AbandonGoalDialog
          goal={goal}
          isPending={abandon.isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void confirmAbandon()}
        />
      ) : null}
    </section>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>): ReactNode {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-foreground-muted uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
