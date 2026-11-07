import { formatMinor, groupCategoryRollupNodes, type MonthlyReport } from "@treasury-ops/shared";
import type { CSSProperties, ReactNode } from "react";

import { CategoryRollupRows, IconGlyph, tint } from "@/features/categories";

import { rollupCategoryMeta } from "../model/rollup-category";

type CategoryBreakdownPanelProps = Readonly<{ rollup: MonthlyReport }>;

export function CategoryBreakdownPanel({ rollup }: CategoryBreakdownPanelProps): ReactNode {
  const ranked = groupCategoryRollupNodes(rollup.consumptionTree).filter(
    ({ root }) => root.totalSpentMinor > 0
  );
  const maxSpent = Math.max(...ranked.map(({ root }) => root.totalSpentMinor), 1);

  return (
    <div className="rounded-[18px] border border-border bg-surface-elevated p-5.5">
      <p className="text-base font-bold tracking-tight text-foreground">Category breakdown</p>
      <div className="mt-4 flex flex-col gap-3.5">
        {ranked.map(({ root, descendants }) => {
          const meta = rollupCategoryMeta(root);
          const iconStyle: CSSProperties = { background: tint(meta.color, 0.14) };
          return (
            <div key={root.categoryId ?? "uncategorized"}>
              <div className="mb-1.5 flex items-center gap-2.5">
                <span
                  style={iconStyle}
                  className="grid h-6.5 w-6.5 shrink-0 place-items-center overflow-hidden rounded-lg text-sm"
                  aria-hidden="true"
                >
                  <IconGlyph value={meta.icon} size={14} />
                </span>
                <span className="text-sm font-semibold text-foreground">{meta.name}</span>
                <span className="rounded-[5px] bg-surface-muted px-1.5 py-0.5 font-mono text-2xs text-foreground-muted">
                  {root.totalTxnCount} txn{root.totalTxnCount === 1 ? "" : "s"}
                </span>
                <div className="flex-1" />
                <span className="font-mono text-sm font-semibold text-foreground">
                  {formatMinor(root.totalSpentMinor)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  style={{
                    width: `${(root.totalSpentMinor / maxSpent) * 100}%`,
                    background: meta.color
                  }}
                  className="h-full origin-left rounded-full animate-fade-in"
                />
              </div>
              <CategoryRollupRows root={root} descendants={descendants} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
