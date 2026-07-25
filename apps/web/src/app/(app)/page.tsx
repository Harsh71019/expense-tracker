import type { ReactNode } from "react";

import {
  DashboardOverview,
  DEFAULT_CASHFLOW_RANGE,
  DEFAULT_PANEL_RANGE,
  TOP_SPENDING_LIMIT,
  getCashflow,
  getInvestments,
  getRecurringForecast,
  getSpendMix,
  getStats,
  getTopSpending
} from "@/features/dashboard";

export default async function DashboardPage(): Promise<ReactNode> {
  const [stats, cashflow, spendMix, topSpending, recurringForecast, investments] =
    await Promise.all([
      getStats(),
      getCashflow(DEFAULT_CASHFLOW_RANGE),
      getSpendMix(DEFAULT_PANEL_RANGE),
      getTopSpending(DEFAULT_PANEL_RANGE, TOP_SPENDING_LIMIT),
      getRecurringForecast(DEFAULT_PANEL_RANGE),
      getInvestments()
    ]);

  return (
    <DashboardOverview
      initialStats={stats}
      initialCashflow={cashflow}
      initialSpendMix={spendMix}
      initialTopSpending={topSpending}
      initialRecurringForecast={recurringForecast}
      initialInvestments={investments}
    />
  );
}
