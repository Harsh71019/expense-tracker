import {
  TopSpendingItemSchema,
  type TopSpendingItem,
  type DashboardRange
} from "@treasury-ops/shared";
import { cache } from "react";
import { z } from "zod";

import { debug } from "@/lib/debug";
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
      if (!parsed.success) {
        debug.api("dashboard top-spending response failed validation", parsed.error.flatten());
        return [];
      }
      return parsed.data;
    } catch (error: unknown) {
      debug.api("dashboard top-spending request failed", error);
      return [];
    }
  }
);
