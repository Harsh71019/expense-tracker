"use client";

import type {
  CashflowResponse,
  BudgetPage,
  DashboardInvestments,
  DashboardStats,
  FinancialDiagnostic,
  MonthlySpending,
  RecurringForecast,
  SpendMix,
  TopSpendingItem
} from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { BudgetDashboardPanel } from "@/features/budgets";
import { DataReadinessPanel } from "@/features/financial-profile";

import { useInvestments } from "../hooks/use-investments";
import { useMonthlySpending } from "../hooks/use-monthly-spending";
import { useStats } from "../hooks/use-stats";
import { DEFAULT_CASHFLOW_RANGE, DEFAULT_PANEL_RANGE } from "../model/defaults";
import { CashFlowPanel } from "./cash-flow-panel";
import { InvestmentsPanel } from "./investments-panel";
import { MonthlySpendingPanel } from "./monthly-spending-panel";
import { RecurringPanel } from "./recurring-panel";
import { SpendMixPanel } from "./spend-mix-panel";
import { StatCards } from "./stat-cards";
import { TopSpendingPanel } from "./top-spending-panel";

type DashboardOverviewProps = Readonly<{
  initialStats: DashboardStats | null;
  initialMonthlySpending: MonthlySpending | null;
  initialCashflow: CashflowResponse;
  initialSpendMix: SpendMix;
  initialTopSpending: TopSpendingItem[];
  initialRecurringForecast: RecurringForecast;
  initialInvestments: DashboardInvestments;
  initialBudgets: BudgetPage | null;
  initialDiagnostic?: FinancialDiagnostic | null;
}>;

export function DashboardOverview({
  initialStats,
  initialMonthlySpending,
  initialCashflow,
  initialSpendMix,
  initialTopSpending,
  initialRecurringForecast,
  initialInvestments,
  initialBudgets,
  initialDiagnostic = null
}: DashboardOverviewProps): ReactNode {
  const statsQuery = useStats(initialStats);
  const monthlySpendingQuery = useMonthlySpending(initialMonthlySpending);
  const investmentsQuery = useInvestments(initialInvestments);
  const stats = statsQuery.data ?? initialStats;
  const monthlySpending = monthlySpendingQuery.data ?? initialMonthlySpending;
  const investments = investmentsQuery.data ?? initialInvestments;

  return (
    <section className="flex flex-col gap-4.5">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Financial overview
          </h1>
          <p className="text-xs text-foreground-muted">
            Live cash flow, spending distribution, and upcoming commitments.
          </p>
        </div>
      </header>

      {initialDiagnostic ? <DataReadinessPanel initialDiagnostic={initialDiagnostic} /> : null}

      {stats === null ? null : <StatCards stats={stats} />}

      {monthlySpending === null ? null : <MonthlySpendingPanel spending={monthlySpending} />}

      <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
        <CashFlowPanel initialCashflow={initialCashflow} initialRange={DEFAULT_CASHFLOW_RANGE} />
        <SpendMixPanel initialSpendMix={initialSpendMix} initialRange={DEFAULT_PANEL_RANGE} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <TopSpendingPanel initialItems={initialTopSpending} initialRange={DEFAULT_PANEL_RANGE} />
        <RecurringPanel
          initialForecast={initialRecurringForecast}
          initialRange={DEFAULT_PANEL_RANGE}
        />
      </div>

      <BudgetDashboardPanel page={initialBudgets} />

      <InvestmentsPanel investments={investments} />
    </section>
  );
}
