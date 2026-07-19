import type { ReactNode } from "react";

import { ReportPage, getMonthlyRollup, reportMonthFromParam } from "@/features/reports";

type ReportSearchParams = Record<string, string | string[] | undefined>;

export default async function ReportsPage({
  searchParams
}: Readonly<{ searchParams: Promise<ReportSearchParams> }>): Promise<ReactNode> {
  const month = reportMonthFromParam((await searchParams).month);
  const rollup = await getMonthlyRollup(month);
  return <ReportPage key={month} initialMonth={month} initialRollup={rollup} />;
}
