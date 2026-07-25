import { DashboardStatsSchema, type DashboardStats } from "@treasury-ops/shared";
import { cache } from "react";

import { debug } from "@/lib/debug";
import { getServerApiClient } from "@/lib/api/server";

export const getStats = cache(async (): Promise<DashboardStats | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/dashboard/stats");
    const parsed = DashboardStatsSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("dashboard stats response failed validation", parsed.error.flatten());
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("dashboard stats request failed", error);
    return null;
  }
});
