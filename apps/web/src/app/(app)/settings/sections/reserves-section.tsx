import type { ReactNode } from "react";

import { ReserveSourceManager } from "@/features/financial-safety";
import { getReserveSources } from "@/features/financial-safety/server/get-reserve-sources";
import { getReserveSummary } from "@/features/financial-safety/server/get-reserve-summary";

export async function ReservesSection(): Promise<ReactNode> {
  const [sources, summary] = await Promise.all([getReserveSources(), getReserveSummary()]);

  return <ReserveSourceManager initialSources={sources} initialSummary={summary} />;
}
