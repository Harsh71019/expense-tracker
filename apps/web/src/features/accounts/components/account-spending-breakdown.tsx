"use client";

import { formatMinor, sumMinorAmounts, type AccountSpendingCategory } from "@treasury-ops/shared";
import type { CSSProperties, ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { CategoryRollupRows } from "@/features/categories";

export function AccountSpendingBreakdown({
  items
}: Readonly<{ items: readonly AccountSpendingCategory[] }>): ReactNode {
  const total = sumMinorAmounts(items.map((item) => item.amountMinor));
  if (items.length === 0 || total === 0) {
    return (
      <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-border bg-surface-muted/30 px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-foreground">No categorized spending</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            Posted everyday expenses will build this mix.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.slice(0, 6).map((item) => {
        const width = Math.max(3, (item.amountMinor / total) * 100);
        const style: CSSProperties = {
          width: `${width}%`,
          backgroundColor: item.color ?? "var(--color-accent)"
        };
        return (
          <div key={item.categoryId ?? "uncategorized"}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                <p className="mt-0.5 font-mono text-2xs text-foreground-muted">
                  {item.transactionCount} {item.transactionCount === 1 ? "entry" : "entries"} ·{" "}
                  {Math.round((item.amountMinor / total) * 100)}%
                </p>
              </div>
              <Money minor={item.amountMinor} size="sm" />
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full" style={style} />
            </div>
            <CategoryRollupRows
              root={{
                ...(item.categoryId === undefined ? {} : { categoryId: item.categoryId }),
                depth: 0,
                name: item.name,
                isArchived: false,
                directSpentMinor: item.directAmountMinor,
                directIncomeMinor: 0,
                directTxnCount: 0,
                totalSpentMinor: item.amountMinor,
                totalIncomeMinor: 0,
                totalTxnCount: item.transactionCount
              }}
              descendants={item.children}
            />
          </div>
        );
      })}
      <p className="sr-only">Total categorized spending: {formatMinor(total)}</p>
    </div>
  );
}
