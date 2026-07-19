"use client";

import type { ReactNode } from "react";

import { monthLabel } from "../model/month";

type MonthSelectorProps = Readonly<{
  months: readonly string[];
  selected: string;
  canGoNext: boolean;
  onSelect: (month: string) => void;
  onPrev: () => void;
  onNext: () => void;
}>;

export function MonthSelector({
  months,
  selected,
  canGoNext,
  onSelect,
  onPrev,
  onNext
}: MonthSelectorProps): ReactNode {
  return (
    <div className="mb-6.5 flex items-center gap-2.5">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous month"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-border bg-surface-elevated text-lg text-foreground"
      >
        ‹
      </button>
      <div className="flex flex-1 gap-1.5 overflow-x-auto">
        {months.map((month) => {
          const active = month === selected;
          return (
            <button
              key={month}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(month)}
              className={`shrink-0 rounded-[10px] border px-3.5 py-2.5 font-mono text-[13px] font-semibold whitespace-nowrap ${
                active
                  ? "border-accent bg-accent-glow text-accent"
                  : "border-border bg-surface-elevated text-foreground-muted"
              }`}
            >
              {monthLabel(month, "short")}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Next month"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-border bg-surface-elevated text-lg text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        ›
      </button>
    </div>
  );
}
