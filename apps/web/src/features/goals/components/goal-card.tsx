"use client";

import type { Goal, GoalPlan } from "@treasury-ops/shared";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

import { Money, SignedMoney } from "@/components/ui/money";

import { goalVerdict } from "../model/goal-verdict";
import { GoalProgressRing } from "./goal-progress-ring";

type GoalCardProps = Readonly<{
  goal: Goal;
  plan: GoalPlan | undefined;
  accountName: string | undefined;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onAbandon?: (goal: Goal) => void;
}>;

const toneClasses = {
  success: "border-income/25 bg-income/10 text-income",
  neutral: "border-accent/25 bg-accent-glow text-accent",
  muted: "border-border bg-surface-muted text-foreground-muted"
} as const;

export function GoalCard({
  goal,
  plan,
  accountName,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  onAbandon
}: GoalCardProps): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  const verdict = goalVerdict(goal, plan, new Date());
  const binding =
    goal.fundingMode === "manual_envelope"
      ? "✉️ Manual envelope"
      : goal.fundingMode === "linked_account"
        ? `🏛️ ${accountName ?? "Linked account"}`
        : `#${goal.tag ?? "tagged"}`;

  return (
    <article className="relative rounded-[18px] border border-border bg-surface-elevated p-5.5 animate-fade-in">
      <div className="flex flex-col gap-4 min-[360px]:flex-row min-[360px]:items-start">
        <div className="self-center min-[360px]:self-auto">
          <GoalProgressRing progressMinor={goal.progressMinor} targetMinor={goal.targetMinor} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/goals/${goal.id}`}
                className="block truncate text-[17px] font-bold tracking-tight text-foreground hover:text-accent"
              >
                {goal.name}
              </Link>
              <p className="mt-1 truncate text-xs font-medium text-foreground-muted">{binding}</p>
            </div>
            {goal.status === "active" && onAbandon !== undefined ? (
              <div className="relative">
                <button
                  type="button"
                  aria-label={`Actions for ${goal.name}`}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="grid h-11 w-11 place-items-center rounded-lg text-lg text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  ⋯
                </button>
                {menuOpen ? (
                  <button
                    type="button"
                    onClick={() => onAbandon(goal)}
                    className="absolute right-0 top-12 z-10 min-h-11 whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-expense shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense"
                  >
                    Abandon goal
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-1.5">
            <SignedMoney minor={goal.progressMinor} size="lg" />
            <span className="text-xs text-foreground-muted">of</span>
            <Money minor={goal.targetMinor} size="sm" />
          </div>

          <span
            className={`mt-3 inline-flex max-w-full rounded-md border px-2 py-1 font-mono text-[9px] leading-relaxed font-bold tracking-wide uppercase ${toneClasses[verdict.tone]}`}
          >
            {verdict.label}
          </span>
        </div>
      </div>

      {goal.status === "active" && (onMoveUp !== undefined || onMoveDown !== undefined) ? (
        <div className="mt-4 flex justify-end gap-1 border-t border-border pt-3">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            aria-label={`Move ${goal.name} up`}
            className="min-h-11 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30"
          >
            ↑ Move up
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            aria-label={`Move ${goal.name} down`}
            className="min-h-11 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-foreground-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30"
          >
            ↓ Move down
          </button>
        </div>
      ) : null}
    </article>
  );
}
