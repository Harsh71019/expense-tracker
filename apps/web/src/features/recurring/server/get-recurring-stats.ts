import { RecurringStatsSchema, type RecurringStats } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

export const getRecurringStats = cache(async (): Promise<RecurringStats | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/recurring/stats");
    const parsed = RecurringStatsSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("recurring stats response failed validation", parsed.error.flatten());
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("recurring stats request failed", error);
    return null;
  }
});
