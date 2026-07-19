import type { ReactNode } from "react";

import { ReportPage, defaultReportMonth, getMonthlyRollup } from "@/features/reports";

export default async function ReportsPage(): Promise<ReactNode> {
  const month = defaultReportMonth();
  const rollup = await getMonthlyRollup(month);
  return <ReportPage initialMonth={month} initialRollup={rollup} />;
}
