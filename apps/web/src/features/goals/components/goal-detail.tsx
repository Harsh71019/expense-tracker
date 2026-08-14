"use client";

import {
  formatMinor,
  type Account,
  type Goal,
  type GoalContribution,
  type GoalContributionType,
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
import { GoalContributionDrawer } from "./goal-contribution-drawer";
import { GoalContributions } from "./goal-contributions";
import { GoalEditorDrawer } from "./goal-editor-drawer";
import { GoalProgressRing } from "./goal-progress-ring";
import { ManualGoalContributions } from "./manual-goal-contributions";

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
  contributionFilters?: ListTransactionsQuery | undefined;
  initialContributions?: TransactionPage | undefined;
  initialManualContributions?: GoalContribution[] | undefined;
}>;

export function GoalDetail({
  initialGoal,
  initialPlan,
  accounts,
  contributionFilters,
  initialContributions,
  initialManualContributions
}: GoalDetailProps): ReactNode {
  const goalQuery = useGoal(initialGoal.id, initialGoal);
  const planQuery = useGoalPlan(initialGoal.id, initialPlan ?? undefined);
  const abandon = useAbandonGoal();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [contributionState, setContributionState] = useState<{
    open: boolean;
    type: GoalContributionType;
  }>({ open: false, type: "deposit" });

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
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xs font-bold tracking-[0.2em] text-accent uppercase">
                {goal.status}
              </span>
              <span className="text-foreground-muted">•</span>
              <span className="font-mono text-2xs font-semibold text-foreground-muted uppercase">
                {goal.fundingMode === "manual_envelope"
                  ? "Manual Envelope"
                  : goal.fundingMode === "linked_account"
                    ? "Linked Account"
                    : "Tagged"}
              </span>
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{goal.name}</h1>
            <p className="mt-2 text-sm text-foreground-muted">
              {goal.fundingMode === "manual_envelope"
                ? "Progress from independent contributions & cash allocations"
                : goal.fundingMode === "linked_account"
                  ? `Progress from ${accountName ?? "linked account"}`
                  : `Progress from #${goal.tag ?? "tagged"} entries`}
            </p>
            <div className="mt-5 flex flex-wrap items-baseline gap-2">
              <SignedMoney minor={goal.progressMinor} size="hero" />
              <span className="text-sm text-foreground-muted">of</span>
              <Money minor={goal.targetMinor} size="lg" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {goal.fundingMode === "manual_envelope" && goal.status === "active" ? (
              <>
                <Button
                  type="button"
                  onClick={() => setContributionState({ open: true, type: "deposit" })}
                >
                  + Deposit
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setContributionState({ open: true, type: "withdrawal" })}
                >
                  − Withdraw
                </Button>
              </>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            {goal.status === "active" ? (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="min-h-11 rounded-lg border border-expense/30 px-4 py-2.5 text-sm font-semibold text-expense transition-colors hover:bg-expense/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense"
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

      {goal.fundingMode === "manual_envelope" ? (
        <ManualGoalContributions
          goalId={goal.id}
          initialContributions={initialManualContributions ?? []}
          onAddDeposit={() => setContributionState({ open: true, type: "deposit" })}
          onAddWithdrawal={() => setContributionState({ open: true, type: "withdrawal" })}
        />
      ) : contributionFilters !== undefined && initialContributions !== undefined ? (
        <GoalContributions filters={contributionFilters} initialPage={initialContributions} />
      ) : null}

      {editOpen ? (
        <GoalEditorDrawer goal={goal} accounts={accounts} onClose={() => setEditOpen(false)} />
      ) : null}
      {contributionState.open ? (
        <GoalContributionDrawer
          goal={goal}
          defaultType={contributionState.type}
          onClose={() => setContributionState({ open: false, type: "deposit" })}
        />
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
      <p className="font-mono text-2xs font-bold tracking-[0.18em] text-foreground-muted uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
