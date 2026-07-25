import {
  TopSpendingItemSchema,
  type TopSpendingItem,
  type DashboardRange
} from "@treasury-ops/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const TopSpendingListSchema = z.array(TopSpendingItemSchema);

export const getTopSpending = cache(
  async (range: DashboardRange, limit: number): Promise<TopSpendingItem[]> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/dashboard/top-spending", {
        params: { query: { range, limit } }
      });
      const parsed = TopSpendingListSchema.safeParse(result.data);
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }
);
