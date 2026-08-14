"use client";

import type {
  CashflowResponse,
  BudgetPage,
  DashboardInvestments,
  DashboardStats,
  MonthlySpending,
  RecurringForecast,
  SpendMix,
  TopSpendingItem
} from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { BudgetDashboardPanel } from "@/features/budgets";

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
}>;

export function DashboardOverview({
  initialStats,
  initialMonthlySpending,
  initialCashflow,
  initialSpendMix,
  initialTopSpending,
  initialRecurringForecast,
  initialInvestments,
  initialBudgets
}: DashboardOverviewProps): ReactNode {
  const statsQuery = useStats(initialStats);
  const monthlySpendingQuery = useMonthlySpending(initialMonthlySpending);
  const investmentsQuery = useInvestments(initialInvestments);
  const stats = statsQuery.data ?? initialStats;
  const monthlySpending = monthlySpendingQuery.data ?? initialMonthlySpending;
  const investments = investmentsQuery.data ?? initialInvestments;

  return (
    <section className="flex flex-col gap-5">
      <header>
        <p className="font-mono text-2xs font-semibold tracking-[2px] text-accent">
          TREASURY OPS · DASHBOARD
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-[36px]">
          Financial overview
        </h1>
        <p className="mt-2 max-w-xl text-sm text-foreground-muted">
          Where your money went this month, what&apos;s growing, and what&apos;s committed ahead.
        </p>
      </header>

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
