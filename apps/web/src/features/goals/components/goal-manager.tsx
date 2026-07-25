"use client";

import type { Account, Goal, GoalPlan } from "@treasury-ops/shared";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/lib/toast";

import { useGoalPlan } from "../hooks/use-goal-plan";
import { useAbandonGoal, useGoals, useReorderGoals } from "../hooks/use-goals";
import { AbandonGoalDialog } from "./abandon-goal-dialog";
import { GoalCard } from "./goal-card";
import { GoalEditorDrawer } from "./goal-editor-drawer";

type GoalManagerProps = Readonly<{
  initialActive: Goal[];
  initialAchieved: Goal[];
  initialPlans: GoalPlan[];
  accounts: Account[];
}>;

type ActiveGoalCardProps = Readonly<{
  goal: Goal;
  initialPlan: GoalPlan | undefined;
  accountName: string | undefined;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAbandon: (goal: Goal) => void;
}>;

function ActiveGoalCard({
  goal,
  initialPlan,
  accountName,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onAbandon
}: ActiveGoalCardProps): ReactNode {
  const plan = useGoalPlan(goal.id, initialPlan);
  return (
    <GoalCard
      goal={goal}
      plan={plan.data}
      accountName={accountName}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onAbandon={onAbandon}
    />
  );
}

export function GoalManager({
  initialActive,
  initialAchieved,
  initialPlans,
  accounts
}: GoalManagerProps): ReactNode {
  const activeQuery = useGoals("active", initialActive);
  const achievedQuery = useGoals("achieved", initialAchieved);
  const reorder = useReorderGoals();
  const abandon = useAbandonGoal();
  const [createOpen, setCreateOpen] = useState(false);
  const [achievedOpen, setAchievedOpen] = useState(false);
  const [abandonTarget, setAbandonTarget] = useState<Goal>();
  const [order, setOrder] = useState(() => initialActive.map((goal) => goal.id));

  const active = activeQuery.data ?? initialActive;
  const achieved = achievedQuery.data ?? initialAchieved;

  useEffect(() => {
    setOrder((current) => {
      const currentSet = new Set(current);
      const liveIds = active.map((goal) => goal.id);
      const preserved = current.filter((id) => liveIds.includes(id));
      const added = liveIds.filter((id) => !currentSet.has(id));
      return [...preserved, ...added];
    });
  }, [active]);

  const activeById = new Map(active.map((goal) => [goal.id, goal]));
  const orderedActive = order
    .map((id) => activeById.get(id))
    .filter((goal): goal is Goal => goal !== undefined);
  const accountById = new Map(accounts.map((account) => [account.id, account.name]));

  async function move(index: number, delta: -1 | 1): Promise<void> {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order];
    const currentId = next[index];
    const targetId = next[nextIndex];
    if (currentId === undefined || targetId === undefined) return;
    next[index] = targetId;
    next[nextIndex] = currentId;
    setOrder(next);
    try {
      await reorder.mutateAsync({ goalIds: next });
    } catch {
      setOrder(order);
      toast.error("Could not reorder goals");
    }
  }

  async function confirmAbandon(): Promise<void> {
    if (abandonTarget === undefined) return;
    try {
      await abandon.mutateAsync(abandonTarget.id);
      setAbandonTarget(undefined);
      toast.success("Goal abandoned");
    } catch {
      toast.error("Could not abandon this goal");
    }
  }

  return (
    <section className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[0.2em] text-accent uppercase">
            Plan · Build · Reach
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Goals
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground-muted">
            Turn an account balance or tagged ledger entries into a visible savings target.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <span className="mr-1 text-base leading-none">+</span> New goal
        </Button>
      </header>

      {orderedActive.length === 0 ? (
        <EmptyState
          title="No active goals"
          description="Create a goal and choose how its progress should be measured."
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Create your first goal
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4.5 md:grid-cols-2 xl:grid-cols-3">
          {orderedActive.map((goal, index) => (
            <ActiveGoalCard
              key={goal.id}
              goal={goal}
              initialPlan={initialPlans.find((plan) => plan.goalId === goal.id)}
              accountName={
                goal.linkedAccountId === undefined
                  ? undefined
                  : accountById.get(goal.linkedAccountId)
              }
              canMoveUp={index > 0}
              canMoveDown={index < orderedActive.length - 1}
              onMoveUp={() => void move(index, -1)}
              onMoveDown={() => void move(index, 1)}
              onAbandon={setAbandonTarget}
            />
          ))}
        </div>
      )}

      {achieved.length === 0 ? null : (
        <section className="border-t border-border pt-5">
          <button
            type="button"
            aria-expanded={achievedOpen}
            onClick={() => setAchievedOpen((open) => !open)}
            className="flex w-full items-center justify-between rounded-lg py-2 text-left"
          >
            <span className="text-base font-bold text-foreground">
              Achieved{" "}
              <span className="font-mono text-sm text-foreground-muted">({achieved.length})</span>
            </span>
            <span className="text-foreground-muted">{achievedOpen ? "−" : "+"}</span>
          </button>
          {achievedOpen ? (
            <div className="mt-3 grid gap-4.5 md:grid-cols-2 xl:grid-cols-3">
              {achieved.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  plan={undefined}
                  accountName={
                    goal.linkedAccountId === undefined
                      ? undefined
                      : accountById.get(goal.linkedAccountId)
                  }
                />
              ))}
            </div>
          ) : null}
        </section>
      )}

      {createOpen ? (
        <GoalEditorDrawer accounts={accounts} onClose={() => setCreateOpen(false)} />
      ) : null}
      {abandonTarget === undefined ? null : (
        <AbandonGoalDialog
          goal={abandonTarget}
          isPending={abandon.isPending}
          onCancel={() => setAbandonTarget(undefined)}
          onConfirm={() => void confirmAbandon()}
        />
      )}
    </section>
  );
}
