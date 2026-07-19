import { formatSignedCompactMinor, type Category, type MonthlyRollup } from "@vyaya/shared";
import type { ReactNode } from "react";

import { rollupCategoryMeta } from "../model/rollup-category";
import { DonutChart } from "./donut-chart";

type SpendByCategoryPanelProps = Readonly<{
  rollup: MonthlyRollup;
  categories: readonly Category[];
}>;

export function SpendByCategoryPanel({ rollup, categories }: SpendByCategoryPanelProps): ReactNode {
  const ranked = rollup.byCategory
    .filter((category) => category.spentMinor > 0)
    .slice()
    .sort((a, b) => b.spentMinor - a.spentMinor);
  const total = rollup.totalExpenseMinor || 1;

  const rows = ranked.map((category, index) => ({
    key: category.categoryId ?? `uncategorized-${index}`,
    meta: rollupCategoryMeta(category.categoryId, categories),
    spentMinor: category.spentMinor
  }));

  return (
    <div className="rounded-[18px] border border-border bg-surface-elevated p-5.5">
      <p className="text-base font-bold tracking-tight text-foreground">Spend by category</p>
      <DonutChart
        slices={rows.map((row) => ({ value: row.spentMinor, color: row.meta.color }))}
        size={190}
        centerValue={formatSignedCompactMinor(rollup.totalExpenseMinor)}
        centerLabel="total spend"
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
