import { DashboardStatsSchema, type DashboardStats } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getStats = cache(async (): Promise<DashboardStats | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/dashboard/stats");
    const parsed = DashboardStatsSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
