"use client";

import type { DashboardRange, RecurringForecast } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { Money, SignedMoney } from "@/components/ui/money";
import { IconGlyph } from "@/features/categories";

import { useRecurringForecast } from "../hooks/use-recurring-forecast";
import { RangeTabs } from "./range-tabs";

const dayFormatter = new Intl.DateTimeFormat("en-IN", { day: "2-digit", timeZone: "Asia/Kolkata" });
const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  timeZone: "Asia/Kolkata"
});

type RecurringPanelProps = Readonly<{
  initialForecast: RecurringForecast;
  initialRange: DashboardRange;
}>;

export function RecurringPanel({ initialForecast, initialRange }: RecurringPanelProps): ReactNode {
  const [range, setRange] = useState<DashboardRange>(initialRange);
  const query = useRecurringForecast(range, range === initialRange ? initialForecast : undefined);
  const forecast = query.data ?? initialForecast;
  const total = forecast.inMinor + forecast.outMinor;
  const inPct = total === 0 ? 50 : (forecast.inMinor / total) * 100;

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">Recurring commitments</h2>
        <div className="text-right">
          <SignedMoney minor={forecast.netMinor} size="lg" />
          <p className="mt-0.5 text-xs text-foreground-muted">net</p>
        </div>
      </div>
      <div className="mt-3">
        <RangeTabs value={range} onChange={setRange} label="Recurring range" />
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1 font-mono text-xs font-semibold text-income">
            <span aria-hidden="true">▲</span>
            <Money minor={forecast.inMinor} size="sm" className="text-income" /> in
          </span>
          <span className="flex items-center gap-1 font-mono text-xs font-semibold text-expense">
            <Money minor={forecast.outMinor} size="sm" className="text-expense" /> out
            <span aria-hidden="true">▼</span>
          </span>
        </div>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-l-full bg-income" style={{ width: `${inPct}%` }} />
          <div className="h-full flex-1 rounded-r-full bg-expense/70" />
        </div>
      </div>
      <p className="mt-6 mb-2 font-mono text-2xs font-semibold tracking-[1.2px] text-foreground-muted">
        UPCOMING · NEXT 30 DAYS
      </p>
      <div className="flex flex-col gap-0.5">
        {forecast.upcoming.length === 0 ? (
          <p className="py-4 text-sm text-foreground-muted">Nothing scheduled.</p>
        ) : (
          forecast.upcoming.map((item) => {
            const income = item.type === "income";
            return (
              <div key={item.ruleId} className="flex items-center gap-3.5 rounded-xl px-2 py-2.5">
                <div className="w-10 shrink-0 text-center">
                  <p className="font-mono text-lg leading-none font-bold text-foreground">
                    {dayFormatter.format(item.nextRunAt)}
                  </p>
                  <p className="mt-0.5 font-mono text-2xs font-semibold tracking-wide text-foreground-muted uppercase">
                    {monthFormatter.format(item.nextRunAt)}
                  </p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-muted">
                  <IconGlyph value={item.icon ?? (income ? "↓" : "↑")} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {income ? "Income" : "Expense"}
                  </p>
                </div>
                <Money
                  minor={item.amountMinor}
                  variant={income ? "income" : "neutral"}
                  signed
                  size="sm"
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
