import type { BudgetOverview as BudgetOverviewData } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";

type BudgetOverviewProps = Readonly<{
  overview: BudgetOverviewData;
}>;

export function BudgetOverview({ overview }: BudgetOverviewProps): ReactNode {
  const isOver = overview.remainingMinor < 0;
  const facts = [
    { label: "Planned", value: overview.plannedMinor, tone: "neutral" },
    {
      label: "Spent in budgeted categories",
      value: overview.spentInBudgetedCategoriesMinor,
      tone: "neutral"
    },
    {
      label: isOver ? "Over planned amount" : "Remaining",
      value: Math.abs(overview.remainingMinor),
      tone: isOver ? "expense" : "income"
    },
    {
      label: "Unbudgeted spending",
      value: overview.unbudgetedSpentMinor,
      tone: "neutral"
    }
  ] as const;

  return (
    <section aria-labelledby="budget-overview-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="budget-overview-title" className="text-lg font-bold text-foreground">
          This month
        </h2>
        <span className="font-mono text-xs text-foreground-muted">
          {overview.activeBudgetCount} active
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-xl border border-border bg-surface-elevated p-4">
            <p className="min-h-8 text-xs leading-snug font-medium text-foreground-muted">
              {fact.label}
            </p>
            <Money minor={fact.value} variant={fact.tone} size="lg" className="mt-2 block" />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
        Unbudgeted spending includes posted expenses in categories without an active budget,
        including Uncategorized.
      </p>
    </section>
  );
}
