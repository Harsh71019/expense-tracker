import type { MonthlyRollup } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { Money, SignedMoney } from "@/components/ui/money";

export function ReportTotals({ rollup }: Readonly<{ rollup: MonthlyRollup }>): ReactNode {
  const savings = rollup.totalIncomeMinor - rollup.totalConsumptionMinor;
  const consumptionTxns = rollup.consumptionByCategory.reduce(
    (sum, category) => sum + category.txnCount,
    0
  );

  return (
    <div className="mb-5.5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-2xl border border-border bg-surface-elevated px-5.5 py-5">
        <p className="font-mono text-2xs font-bold tracking-[1.2px] text-foreground-muted">
          CONSUMPTION
        </p>
        <div className="mt-2.5">
          <Money minor={rollup.totalConsumptionMinor} size="lg" />
        </div>
        <p className="mt-1.5 text-xs font-medium text-foreground-muted">
          {consumptionTxns} transaction{consumptionTxns === 1 ? "" : "s"}
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-surface-elevated px-5.5 py-5">
        <p className="font-mono text-2xs font-bold tracking-[1.2px] text-foreground-muted">
          ASSET FUNDING
        </p>
        <div className="mt-2.5">
          <Money minor={rollup.totalAssetFundingMinor} size="lg" />
        </div>
        <p className="mt-1.5 text-xs font-medium text-foreground-muted">Moved into assets</p>
      </div>
      <div className="rounded-2xl border border-border bg-surface-elevated px-5.5 py-5">
        <p className="font-mono text-2xs font-bold tracking-[1.2px] text-foreground-muted">
          CASH OUT
        </p>
        <div className="mt-2.5">
          <Money minor={rollup.totalCashOutflowMinor} size="lg" />
        </div>
        <p className="mt-1.5 text-xs font-medium text-foreground-muted">All account outflows</p>
      </div>
      <div className="rounded-2xl border border-border bg-surface-elevated px-5.5 py-5">
        <p className="font-mono text-2xs font-bold tracking-[1.2px] text-foreground-muted">
          RECEIVED
        </p>
        <div className="mt-2.5">
          <Money minor={rollup.totalIncomeMinor} variant="income" size="lg" />
        </div>
      </div>
      <div
        className={`rounded-2xl border bg-surface-elevated px-5.5 py-5 ${savings >= 0 ? "border-accent/40" : "border-border"}`}
      >
        <p className="font-mono text-2xs font-bold tracking-[1.2px] text-foreground-muted">
          SAVINGS
        </p>
        <div className="mt-2.5">
          <SignedMoney minor={savings} size="lg" />
        </div>
        <p className="mt-1.5 text-xs font-medium text-foreground-muted">
          {savings >= 0 ? "after consumption" : "consumption exceeded income"}
        </p>
      </div>
    </div>
  );
}
