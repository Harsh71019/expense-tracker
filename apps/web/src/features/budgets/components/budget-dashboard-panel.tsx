import type { BudgetPage } from "@treasury-ops/shared";
import Link from "next/link";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";

import { budgetStatusLabel } from "../model/presentation";

type BudgetDashboardPanelProps = Readonly<{
  page: BudgetPage | null;
}>;

export function BudgetDashboardPanel({ page }: BudgetDashboardPanelProps): ReactNode {
  if (page === null || page.overview.activeBudgetCount === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface-elevated p-6">
        <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-accent uppercase">
          Monthly planning
        </p>
        <h2 className="mt-2 text-lg font-bold tracking-tight text-foreground">Monthly budgets</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          Set optional category limits and compare them with posted spending.
        </p>
        <Link
          href="/budgets"
          className="mt-4 inline-flex text-sm font-semibold text-accent hover:text-accent-strong"
        >
          Set up budgets →
        </Link>
      </section>
    );
  }

  const attention = page.items
    .filter((item) => item.isEffective && item.state !== "under")
    .slice(0, 3);

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.18em] text-accent uppercase">
            Monthly planning
          </p>
          <h2 className="mt-2 text-lg font-bold tracking-tight text-foreground">Monthly budgets</h2>
        </div>
        <Link
          href="/budgets"
          className="text-xs font-semibold text-accent hover:text-accent-strong"
        >
          View all →
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-muted p-3">
          <p className="text-xs text-foreground-muted">Planned</p>
          <Money minor={page.overview.plannedMinor} size="md" className="mt-1 block" />
        </div>
        <div className="rounded-xl bg-surface-muted p-3">
          <p className="text-xs text-foreground-muted">Spent</p>
          <Money
            minor={page.overview.spentInBudgetedCategoriesMinor}
            size="md"
            className="mt-1 block"
          />
        </div>
      </div>
      {attention.length === 0 ? (
        <p className="mt-4 text-sm text-foreground-muted">No category is near its monthly limit.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {attention.map((item) => (
            <li key={item.budget.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-foreground">{item.category.name}</span>
              <span className="shrink-0 text-xs font-semibold text-expense">
                {budgetStatusLabel(item.state)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
