"use client";

import {
  CreateGoalSchema,
  UpdateGoalSchema,
  type Account,
  type Goal,
  type GoalFundingMode
} from "@treasury-ops/shared";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { DialogSurface } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/toast";

import { useCreateGoal, useUpdateGoal } from "../hooks/use-goals";
import { dateInputToUtc, dateToInput, todayInIndia } from "../model/goal-form";

const fieldLabel =
  "mb-1.5 block font-mono text-[9px] font-extrabold tracking-[0.22em] text-foreground-muted uppercase";

type GoalEditorDrawerProps = Readonly<{
  accounts: readonly Account[];
  goal?: Goal;
  onClose: () => void;
}>;

export function GoalEditorDrawer({ accounts, goal, onClose }: GoalEditorDrawerProps): ReactNode {
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const [name, setName] = useState(goal?.name ?? "");
  const [targetMinor, setTargetMinor] = useState(goal?.targetMinor ?? 0);
  const [targetDate, setTargetDate] = useState(dateToInput(goal?.targetDate));
  const [fundingMode, setFundingMode] = useState<GoalFundingMode>(
    goal?.fundingMode ?? "linked_account"
  );
  const [linkedAccountId, setLinkedAccountId] = useState(goal?.linkedAccountId ?? "");
  const [tag, setTag] = useState(goal?.tag ?? "");
  const [error, setError] = useState<string>();
  const isPending = createGoal.isPending || updateGoal.isPending;
  const availableAccounts = accounts.filter(
    (account) => !account.isArchived || account.id === linkedAccountId
  );

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    let parsedDate: Date | undefined;
    try {
      parsedDate = targetDate === "" ? undefined : dateInputToUtc(targetDate);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Choose a valid target date.");
      return;
    }

    try {
      if (goal === undefined) {
        const parsed = CreateGoalSchema.safeParse(
          fundingMode === "linked_account"
            ? {
                name,
                targetMinor,
                ...(parsedDate === undefined ? {} : { targetDate: parsedDate }),
                fundingMode,
                linkedAccountId
              }
            : {
                name,
                targetMinor,
                ...(parsedDate === undefined ? {} : { targetDate: parsedDate }),
                fundingMode,
                tag
              }
        );
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the goal details.");
          return;
        }
        await createGoal.mutateAsync(parsed.data);
        toast.success("Goal created");
      } else {
        const parsed = UpdateGoalSchema.safeParse({
          name,
          targetMinor,
          targetDate: parsedDate ?? null
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the goal details.");
          return;
        }
        await updateGoal.mutateAsync({ goalId: goal.id, patch: parsed.data });
        toast.success("Goal updated");
      }
      onClose();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not save this goal.");
    }
  }

  return (
    <DialogSurface
      labelledBy="goal-editor-title"
      onClose={onClose}
      variant="drawer"
      panelClassName="max-w-[520px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-accent uppercase">
            Savings plan
          </p>
          <h2 id="goal-editor-title" className="mt-1.5 text-xl font-bold text-foreground">
            {goal === undefined ? "New goal" : "Edit goal"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close goal form"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✕
        </button>
      </div>

      <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-5">
        <Input
          id="goal-name"
          label="Goal name"
          value={name}
          maxLength={80}
          name="name"
          autoComplete="off"
          placeholder="Emergency fund…"
          onChange={(event) => setName(event.target.value)}
        />
        <AmountInput
          id="goal-target"
          label="Target amount"
          value={targetMinor}
          onChange={setTargetMinor}
        />
        <Input
          id="goal-target-date"
          label="Target date (optional)"
          type="date"
          min={todayInIndia()}
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
        />

        {goal === undefined ? (
          <div>
            <span className={fieldLabel}>Track progress from</span>
            <div className="grid grid-cols-2 gap-2">
              {(["linked_account", "tagged"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={fundingMode === mode}
                  onClick={() => setFundingMode(mode)}
                  className={`min-h-11 rounded-lg border px-3 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    fundingMode === mode
                      ? "border-accent bg-accent-glow text-accent"
                      : "border-border text-foreground-muted"
                  }`}
                >
                  {mode === "linked_account" ? "Account balance" : "Transaction tag"}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-surface-muted p-3 text-xs text-foreground-muted">
            Progress source cannot be changed because it defines the goal’s history.
          </p>
        )}

        {fundingMode === "linked_account" ? (
          <div className="flex flex-col gap-1.5 font-mono text-[9px] font-extrabold tracking-[0.22em] text-foreground-muted uppercase">
            <span>Linked account</span>
            <Select
              aria-label="Linked account"
              name="linkedAccountId"
              options={[
                { value: "", label: "Choose an account" },
                ...availableAccounts.map((account) => ({
                  value: account.id,
                  label: `${account.name}${account.isArchived ? " (archived)" : ""}`
                }))
              ]}
              placeholder="Choose an account"
              value={linkedAccountId}
              disabled={goal !== undefined}
              onChange={setLinkedAccountId}
            />
          </div>
        ) : (
          <Input
            id="goal-tag"
            name="tag"
            autoComplete="off"
            label="Transaction tag"
            value={tag}
            maxLength={40}
            disabled={goal !== undefined}
            placeholder="goal:laptop…"
            onChange={(event) => setTag(event.target.value)}
          />
        )}

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
          <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
            {isPending ? "Saving…" : goal === undefined ? "Create goal" : "Save changes"}
          </Button>
        </div>
      </form>
    </DialogSurface>
  );
}
