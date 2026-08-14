"use client";

import type { DashboardRange, TopSpendingItem } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { IconGlyph } from "@/features/categories";

import { useTopSpending } from "../hooks/use-top-spending";
import { TOP_SPENDING_LIMIT } from "../model/defaults";
import { RangeTabs } from "./range-tabs";

const FALLBACK_COLOR = "#71817a";

type TopSpendingPanelProps = Readonly<{
  initialItems: TopSpendingItem[];
  initialRange: DashboardRange;
}>;

export function TopSpendingPanel({ initialItems, initialRange }: TopSpendingPanelProps): ReactNode {
  const [range, setRange] = useState<DashboardRange>(initialRange);
  const query = useTopSpending(
    range,
    TOP_SPENDING_LIMIT,
    range === initialRange ? initialItems : undefined
  );
  const items = query.data ?? initialItems;
  const total = items.reduce((sum, item) => sum + item.amountMinor, 0);
  const max = Math.max(...items.map((item) => item.amountMinor), 1);

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Top spending</h2>
        <Money minor={total} size="sm" />
      </div>
      <div className="mt-3">
        <RangeTabs value={range} onChange={setRange} label="Top spending range" />
      </div>
      {items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-foreground-muted">No spending in this range.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {items.map((item, index) => {
            const color = item.color ?? FALLBACK_COLOR;
            const pct = total === 0 ? 0 : Math.round((item.amountMinor / total) * 100);
            return (
              <div key={item.categoryId ?? item.name}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="w-4 shrink-0 font-mono text-xs font-bold text-foreground-muted">
                    {index + 1}
                  </span>
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                    style={{ background: `${color}29` }}
                  >
                    <IconGlyph value={item.icon ?? "∅"} size={14} />
                  </span>
                  <span className="text-sm font-semibold text-foreground">{item.name}</span>
                  <div className="flex-1" />
                  <Money minor={item.amountMinor} size="sm" />
                  <span className="w-9 text-right font-mono text-2xs text-foreground-muted">
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(item.amountMinor / max) * 100}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
