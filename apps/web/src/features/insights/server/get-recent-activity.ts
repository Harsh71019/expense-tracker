import { RecentActivityItemSchema, type RecentActivityItem } from "@treasury-ops/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const RecentActivityListSchema = z.array(RecentActivityItemSchema);

export const getRecentActivity = cache(async (limit: number): Promise<RecentActivityItem[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/dashboard/recent-activity", {
      params: { query: { limit } }
    });
    const parsed = RecentActivityListSchema.safeParse(result.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
});
