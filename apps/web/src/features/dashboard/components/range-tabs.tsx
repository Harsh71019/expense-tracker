"use client";

import type { DashboardRange } from "@treasury-ops/shared";
import type { ReactNode } from "react";

const RANGES: readonly DashboardRange[] = ["1W", "1M", "6M", "12M"];

type RangeTabsProps = Readonly<{
  value: DashboardRange;
  onChange: (range: DashboardRange) => void;
  label: string;
}>;

export function RangeTabs({ value, onChange, label }: RangeTabsProps): ReactNode {
  return (
    <div
      className="inline-flex gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5"
      role="group"
      aria-label={label}
    >
      {RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          onClick={() => onChange(range)}
          className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors duration-150 ${
            value === range
              ? "bg-surface-elevated text-accent shadow-sm"
              : "text-foreground-muted hover:text-foreground"
          }`}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
