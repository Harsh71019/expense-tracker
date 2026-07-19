import type { MonthlyRollup } from "@vyaya/shared";
import type { ReactNode } from "react";

import { Money, SignedMoney } from "@/components/ui/money";

export function ReportTotals({ rollup }: Readonly<{ rollup: MonthlyRollup }>): ReactNode {
  const net = rollup.totalIncomeMinor - rollup.totalExpenseMinor;
  const expenseTxns = rollup.byCategory.reduce((sum, category) => sum + category.txnCount, 0);

  return (
    <div className="mb-5.5 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-border bg-surface-elevated px-5.5 py-5">
        <p className="font-mono text-[10px] font-bold tracking-[1.2px] text-foreground-muted">
          SPENT
        </p>
        <div className="mt-2.5">
          <Money minor={rollup.totalExpenseMinor} size="lg" />
        </div>
        <p className="mt-1.5 text-xs font-medium text-foreground-muted">
          {expenseTxns} transaction{expenseTxns === 1 ? "" : "s"}
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-surface-elevated px-5.5 py-5">
        <p className="font-mono text-[10px] font-bold tracking-[1.2px] text-foreground-muted">
          RECEIVED
        </p>
        <div className="mt-2.5">
          <Money minor={rollup.totalIncomeMinor} variant="income" size="lg" />
        </div>
      </div>
      <div
        className={`rounded-2xl border bg-surface-elevated px-5.5 py-5 ${net >= 0 ? "border-accent/40" : "border-border"}`}
      >
        <p className="font-mono text-[10px] font-bold tracking-[1.2px] text-foreground-muted">
          NET FLOW
        </p>
        <div className="mt-2.5">
          <SignedMoney minor={net} size="lg" />
        </div>
        <p className="mt-1.5 text-xs font-medium text-foreground-muted">
          {net >= 0 ? "saved this month" : "overspent this month"}
        </p>
      </div>
    </div>
  );
}
