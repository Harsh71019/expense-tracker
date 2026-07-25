import { DashboardInvestmentsSchema, type DashboardInvestments } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getInvestments = cache(async (): Promise<DashboardInvestments> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/dashboard/investments");
    const parsed = DashboardInvestmentsSchema.safeParse(result.data);
    return parsed.success ? parsed.data : { items: [] };
  } catch {
    return { items: [] };
  }
});
