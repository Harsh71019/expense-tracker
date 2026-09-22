import type { ReactNode } from "react";

import { getBudgetPage } from "@/features/budgets/server/get-budgets";
import {
  DashboardOverview,
  DEFAULT_CASHFLOW_RANGE,
  DEFAULT_PANEL_RANGE,
  TOP_SPENDING_LIMIT,
  getCashflow,
  getInvestments,
  getMonthlySpending,
  getRecurringForecast,
  getSpendMix,
  getStats,
  getTopSpending
} from "@/features/dashboard";
import { getFinancialDiagnostic } from "@/features/financial-profile/server/get-financial-diagnostic";
import { getEssentialBurn } from "@/features/financial-safety/server/get-essential-burn";
import { getSafetyEvaluation } from "@/features/financial-safety/server/get-safety-evaluation";

export default async function DashboardPage(): Promise<ReactNode> {
  const [
    stats,
    monthlySpending,
    cashflow,
    spendMix,
    topSpending,
    recurringForecast,
    investments,
    budgets,
    diagnostic,
    essentialBurn,
    safetyEvaluation
  ] = await Promise.all([
    getStats(),
    getMonthlySpending(),
    getCashflow(DEFAULT_CASHFLOW_RANGE),
    getSpendMix(DEFAULT_PANEL_RANGE),
    getTopSpending(DEFAULT_PANEL_RANGE, TOP_SPENDING_LIMIT),
    getRecurringForecast(DEFAULT_PANEL_RANGE),
    getInvestments(),
    getBudgetPage(false, 200),
    getFinancialDiagnostic(),
    getEssentialBurn(),
    getSafetyEvaluation()
  ]);

  return (
    <DashboardOverview
      initialStats={stats}
      initialMonthlySpending={monthlySpending}
      initialCashflow={cashflow}
      initialSpendMix={spendMix}
      initialTopSpending={topSpending}
      initialRecurringForecast={recurringForecast}
      initialInvestments={investments}
      initialBudgets={budgets}
      initialDiagnostic={diagnostic}
      initialEssentialBurn={essentialBurn}
      initialSafetyEvaluation={safetyEvaluation}
    />
  );
}
