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

import { Money } from "@/components/ui/money";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [order, setOrder] = useState(() => initialActive.map((goal) => goal.id));

  const active = activeQuery.data ?? initialActive;
  const achieved = achievedQuery.data ?? initialAchieved;

  const totalTargetMinor = active.reduce((acc, goal) => acc + goal.targetMinor, 0);
  const totalSavedMinor = active.reduce((acc, goal) => acc + Math.max(0, goal.progressMinor), 0);
  const overallPercentage =
    totalTargetMinor > 0
      ? Math.min(100, Math.round((totalSavedMinor / totalTargetMinor) * 100))
      : 0;

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
  let orderedActive = order
    .map((id) => activeById.get(id))
    .filter((goal): goal is Goal => goal !== undefined);

  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase().trim();
    orderedActive = orderedActive.filter((goal) => goal.name.toLowerCase().includes(q));
  }

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
      <header className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-bold tracking-[0.2em] text-accent uppercase">
            Plan · Build · Reach
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Goals
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground-muted">
            Track savings with independent manual envelopes, account balances, or tagged expenses.
          </p>
        </div>
        <Button type="button" className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
          <span className="mr-1 text-base leading-none">+</span> New goal
        </Button>
      </header>

      {active.length > 0 ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface-elevated p-4">
            <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-foreground-muted uppercase">
              Total Target
            </p>
            <div className="mt-2">
              <Money minor={totalTargetMinor} size="lg" />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface-elevated p-4">
            <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-foreground-muted uppercase">
              Total Saved
            </p>
            <div className="mt-2">
              <Money minor={totalSavedMinor} size="lg" variant="income" />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface-elevated p-4">
            <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-foreground-muted uppercase">
              Overall Progress
            </p>
            <p className="mt-2 text-xl font-bold tracking-tight text-foreground">
              {overallPercentage}%
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-elevated p-4">
            <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-foreground-muted uppercase">
              Active Goals
            </p>
            <p className="mt-2 text-xl font-bold tracking-tight text-accent">{active.length}</p>
          </div>
        </div>
      ) : null}

      {active.length > 0 && (
        <div
          className={`mb-5 flex flex-wrap items-center gap-3.5 rounded-2xl border p-3.5 backdrop-blur transition-all duration-200 ${
            searchQuery.trim() !== ""
              ? "border-accent/40 bg-surface-elevated/90 shadow-sm"
              : "border-border/80 bg-surface-elevated/90"
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border/80 bg-surface-muted/60 px-3.5 transition-colors focus-within:border-accent/60 focus-within:bg-surface-muted focus-within:ring-2 focus-within:ring-accent/20">
            <span className="text-foreground-muted/70 text-sm font-semibold" aria-hidden="true">
              ⌕
            </span>
            <input
              value={searchQuery}
              name="goalSearch"
              autoComplete="off"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search goals by target name…"
              aria-label="Search goals"
              className="min-h-10 w-full bg-transparent py-2 text-base text-foreground outline-none placeholder:text-foreground-muted/60 sm:text-sm"
            />
            {searchQuery !== "" && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search input"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-foreground-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

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
            className="flex min-h-11 w-full items-center justify-between rounded-lg py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
