"use client";

import type { DashboardRange, SpendMix } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Money } from "@/components/ui/money";
import { PieChart } from "@/features/reports/components/pie-chart";

import { useSpendMix } from "../hooks/use-spend-mix";
import { RangeTabs } from "./range-tabs";

const ESSENTIAL_COLOR = "#3b82f6";
const LIFESTYLE_COLOR = "#ec4899";
const UNCATEGORIZED_COLOR = "#71817a";

type SpendMixPanelProps = Readonly<{
  initialSpendMix: SpendMix;
  initialRange: DashboardRange;
}>;

export function SpendMixPanel({ initialSpendMix, initialRange }: SpendMixPanelProps): ReactNode {
  const [range, setRange] = useState<DashboardRange>(initialRange);
  const query = useSpendMix(range, range === initialRange ? initialSpendMix : undefined);
  const mix = query.data ?? initialSpendMix;

  const legend = [
    {
      name: "Essentials",
      amountMinor: mix.essential.amountMinor,
      pct: mix.essential.pct,
      color: ESSENTIAL_COLOR
    },
    {
      name: "Lifestyle",
      amountMinor: mix.lifestyle.amountMinor,
      pct: mix.lifestyle.pct,
      color: LIFESTYLE_COLOR
    },
    ...(mix.uncategorized.amountMinor > 0
      ? [
          {
            name: "Uncategorized",
            amountMinor: mix.uncategorized.amountMinor,
            pct: mix.uncategorized.pct,
            color: UNCATEGORIZED_COLOR
          }
        ]
      : [])
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Spend mix</h2>
        <RangeTabs value={range} onChange={setRange} label="Spend mix range" />
      </div>
      {mix.totalMinor === 0 ? (
        <p className="py-10 text-center text-sm text-foreground-muted">
          No spending in this range.
        </p>
      ) : (
        <>
          <PieChart
            slices={legend.map((entry) => ({ value: entry.amountMinor, color: entry.color }))}
            size={180}
          />
          <div className="mt-5 flex flex-col gap-3">
            {legend.map((entry) => (
              <div key={entry.name} className="flex items-center gap-3">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-[4px]"
                  style={{ background: entry.color }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{entry.name}</p>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {Math.round(entry.pct)}% of spending
                  </p>
                </div>
                <Money minor={entry.amountMinor} size="sm" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
