"use client";

import type { RecurringOccurrence, RecurringOccurrenceStatus } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { useRecurringOccurrences } from "../hooks/use-recurring-occurrences";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata"
});

const TICK_STYLES: Record<RecurringOccurrenceStatus, string> = {
  confirmed: "border-income/40 bg-income/10 text-income",
  expected: "border-border bg-surface-muted text-foreground-muted",
  missed: "border-expense/40 bg-expense/10 text-expense"
};

const TICK_GLYPH: Record<RecurringOccurrenceStatus, string> = {
  confirmed: "✓",
  expected: "⏳",
  missed: "✕"
};

const MAX_VISIBLE = 12;

export function OccurrenceTickRow({ ruleId }: Readonly<{ ruleId: string }>): ReactNode {
  const occurrences = useRecurringOccurrences(ruleId);
  const items = occurrences.data;
  if (items === undefined || items.length === 0) return null;

  const visible: RecurringOccurrence[] = [...items].reverse().slice(0, MAX_VISIBLE);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-foreground-muted uppercase">
        Occurrences
      </span>
      <div className="flex flex-wrap gap-1">
        {visible.map((occurrence) => (
          <span
            key={occurrence.id}
            title={`${dateFormatter.format(occurrence.occurredAt)} — ${occurrence.status}`}
            aria-label={`${dateFormatter.format(occurrence.occurredAt)}, ${occurrence.status}`}
            className={`grid h-6 w-6 place-items-center rounded-md border text-[10px] font-bold ${TICK_STYLES[occurrence.status]}`}
          >
            {TICK_GLYPH[occurrence.status]}
          </span>
        ))}
      </div>
    </div>
  );
}
