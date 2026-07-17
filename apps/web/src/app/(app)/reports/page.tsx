import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { NetWorthSummary } from "@/features/net-worth";
import { getNetWorth } from "@/features/net-worth/server/get-net-worth";

export default async function ReportsPage(): Promise<ReactNode> {
  const netWorth = await getNetWorth();
  if (netWorth === null) notFound();
  return <NetWorthSummary initialData={netWorth} />;
}
