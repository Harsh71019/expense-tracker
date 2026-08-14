import type { BudgetProgress } from "@treasury-ops/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { IconGlyph } from "@/features/categories";

import {
  budgetStatusLabel,
  budgetTransactionsHref,
  utilizationPercent
} from "../model/presentation";
import { BudgetMeter } from "./budget-meter";

type BudgetCardProps = Readonly<{
  progress: BudgetProgress;
  month: string;
  onEdit: (progress: BudgetProgress) => void;
  onArchive: (progress: BudgetProgress) => void;
}>;

const statusClasses = {
  under: "border-accent/25 bg-accent-glow text-accent",
  approaching: "border-income/25 bg-income/10 text-income",
  reached: "border-expense/25 bg-expense/10 text-expense"
} as const;

const statusSymbols = {
  under: "✓",
  approaching: "!",
  reached: "↑"
} as const;

export function BudgetCard({ progress, month, onEdit, onArchive }: BudgetCardProps): ReactNode {
  const inactive = !progress.isEffective;
  const over = progress.remainingMinor < 0;
  const color = progress.category.color ?? "currentColor";

  return (
    <article className="rounded-2xl border border-border bg-surface-elevated p-5 animate-fade-in">
      <div className="flex items-start gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-muted text-foreground"
          style={{ color }}
          aria-hidden="true"
        >
          <IconGlyph
            value={progress.category.icon ?? progress.category.name.slice(0, 1)}
            size={20}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="truncate text-base font-bold text-foreground">
                {progress.category.name}
              </h3>
              <p className="mt-0.5 text-xs text-foreground-muted">Exact category · monthly</p>
            </div>
            {inactive ? (
              <span className="rounded-md border border-border bg-surface-muted px-2 py-1 font-mono text-2xs font-bold tracking-wide text-foreground-muted uppercase">
                Inactive
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-2xs font-bold tracking-wide uppercase ${statusClasses[progress.state]}`}
              >
                <span aria-hidden="true">{statusSymbols[progress.state]}</span>
                {budgetStatusLabel(progress.state)}
              </span>
            )}
          </div>
        </div>
      </div>

      {inactive ? (
        <p className="mt-4 rounded-lg border border-border bg-surface-muted p-3 text-sm leading-relaxed text-foreground-muted">
          {progress.category.isArchived
            ? "This category is archived, so its budget is read-only and excluded from totals."
            : "This budget is archived. Save a new monthly limit to restore it."}
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-foreground-muted">Spent</p>
              <Money minor={progress.spentMinor} size="lg" className="mt-1 block" />
            </div>
            <div className="text-right">
              <p className="text-xs text-foreground-muted">of monthly limit</p>
              <Money minor={progress.budget.limitMinor} size="md" className="mt-1 block" />
            </div>
          </div>
          <div className="mt-4">
            <BudgetMeter progress={progress} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <span className={over ? "font-semibold text-expense" : "text-foreground-muted"}>
              {over ? "Over by " : "Remaining "}
              <Money
                minor={Math.abs(progress.remainingMinor)}
                variant={over ? "expense" : "neutral"}
                size="sm"
              />
            </span>
            <span className="font-mono text-foreground-muted tabular-nums">
              {utilizationPercent(progress.utilizationBps)}%
            </span>
          </div>
        </>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Link
          href={budgetTransactionsHref(progress.category.id, month)}
          className="text-xs font-semibold text-accent hover:text-accent-strong"
        >
          View this month&apos;s entries
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={progress.category.isArchived}
            onClick={() => onEdit(progress)}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
          >
            {progress.budget.isArchived ? "Restore" : "Edit"}
          </button>
          {inactive ? null : (
            <button
              type="button"
              onClick={() => onArchive(progress)}
              className="min-h-11 rounded-lg px-3 py-2 text-xs font-semibold text-foreground-muted hover:bg-surface-muted hover:text-expense focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-expense"
            >
              Archive
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
