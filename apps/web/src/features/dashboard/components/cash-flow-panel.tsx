"use client";

import type { CashflowResponse, DashboardRange } from "@treasury-ops/shared";
import { useState } from "react";
import type { ReactNode } from "react";

import { useCashflow } from "../hooks/use-cashflow";
import { CashFlowChart } from "./cash-flow-chart";
import { RangeTabs } from "./range-tabs";

type CashFlowPanelProps = Readonly<{
  initialCashflow: CashflowResponse;
  initialRange: DashboardRange;
}>;

export function CashFlowPanel({ initialCashflow, initialRange }: CashFlowPanelProps): ReactNode {
  const [range, setRange] = useState<DashboardRange>(initialRange);
  const query = useCashflow(range, range === initialRange ? initialCashflow : undefined);
  const cashflow = query.data ?? initialCashflow;

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Cash flow</h2>
          <p className="mt-1 text-sm text-foreground-muted">Income vs. spending over time</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
            <span className="h-2.5 w-2.5 rounded-sm bg-income" aria-hidden="true" />
            Income
          </span>
          <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
            <span className="h-2.5 w-2.5 rounded-sm bg-expense" aria-hidden="true" />
            Spending
          </span>
        </div>
      </div>
      <div className="mt-3">
        <RangeTabs value={range} onChange={setRange} label="Cash flow range" />
      </div>
      <div className="mt-4">
        <CashFlowChart buckets={cashflow.buckets} />
      </div>
    </div>
  );
}
