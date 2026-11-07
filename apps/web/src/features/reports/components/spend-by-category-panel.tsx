import type { MonthlyReport } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { rollupCategoryMeta, rootsWithSpend } from "../model/rollup-category";
import { PieChart } from "./pie-chart";

type SpendByCategoryPanelProps = Readonly<{ rollup: MonthlyReport }>;

export function SpendByCategoryPanel({ rollup }: SpendByCategoryPanelProps): ReactNode {
  const total = rollup.totalConsumptionMinor || 1;

  const rows = rootsWithSpend(rollup.consumptionTree).map((node) => ({
    key: node.categoryId ?? "uncategorized",
    meta: rollupCategoryMeta(node),
    spentMinor: node.totalSpentMinor
  }));

  return (
    <div className="rounded-[18px] border border-border bg-surface-elevated p-5.5">
      <p className="text-base font-bold tracking-tight text-foreground">Spend by category</p>
      <PieChart
        slices={rows.map((row) => ({ value: row.spentMinor, color: row.meta.color }))}
        size={190}
      />
      <div className="mt-4.5 flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2.5">
            <span
              style={{ background: row.meta.color }}
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              aria-hidden="true"
            />
            <span className="text-[13px] font-medium text-foreground">{row.meta.name}</span>
            <div className="flex-1" />
            <span className="font-mono text-xs font-semibold text-foreground-muted">
              {Math.round((row.spentMinor / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
