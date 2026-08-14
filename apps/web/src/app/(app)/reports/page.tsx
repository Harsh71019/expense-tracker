import type { ReactNode } from "react";

import { ReportPage, reportMonthFromParam } from "@/features/reports";
import { getMonthlyRollup } from "@/features/reports/server/get-monthly-rollup";

type ReportSearchParams = Record<string, string | string[] | undefined>;

export default async function ReportsPage({
  searchParams
}: Readonly<{ searchParams: Promise<ReportSearchParams> }>): Promise<ReactNode> {
  const month = reportMonthFromParam((await searchParams).month);
  const rollup = await getMonthlyRollup(month);
  return <ReportPage key={month} initialMonth={month} initialRollup={rollup} />;
}
