import type { ReactNode } from "react";

import { SalaryWorkPanel } from "@/features/financial-profile";
import {
  SALARY_HISTORY_PAGE_SIZE,
  getFinancialProfileState,
  getSalaryStatistics,
  getSalaryVersionPage
} from "@/features/financial-profile/server/get-financial-profile";

export async function IncomeSection(): Promise<ReactNode> {
  const [state, statistics, history] = await Promise.all([
    getFinancialProfileState(),
    getSalaryStatistics(),
    getSalaryVersionPage()
  ]);

  return (
    <SalaryWorkPanel
      initialState={state}
      initialStatistics={statistics}
      initialHistory={history}
      historyPageSize={SALARY_HISTORY_PAGE_SIZE}
    />
  );
}
